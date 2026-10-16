import { mt } from './main-i18n'
import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  parseAiAssistantReply,
  type AiAssistantReply,
  type AiChatPayload,
  type AiDebugEntry,
  type AiSettings,
  type AiStreamEvent
} from '../shared/ipc'
import type { SshSessionManager } from './ssh-manager'
import { forwardDebugPayloadToWindow } from './debug-window-broadcast'
import { buildBootstrapPrompt } from './core-a-bootstrap'
import {
  appendStoredArchive,
  currentThreadEpoch,
  loadPersistedCoreSession,
  loadThreadContext,
  onThreadContextCleared,
  savePersistedCoreSession,
  saveThreadContext
} from './core-a-memory'
import {
  absorbUserTurn,
  actionNeedsHumanInterrupt,
  buildMemoryPromptBlocks,
  compactTranscript,
  confirmBypassAllowed,
  contextBudget,
  observeOmBudget,
  cancelHitl,
  createHitlLoop,
  formatArchivedGoal,
  appendEpisode,
  hitlIsPlannable,
  interruptForProposal,
  markHitlExecuting,
  markHitlObserving,
  markWorkingStatus,
  recallEpisodes,
  resolveThreadId,
  resumeHitl,
  sideEffectExecutionPermitted,
  summarizePlannerStep,
  type HitlLoopState,
  type TranscriptTurn
} from './core-a-context'
import { createInFlightBook, isInteractiveCommand, planCommandConfirm, safetyTierEngaged, effectiveSafetyTier, type SafetyMode } from '../shared/safety-tier'
import { getInventoryStore } from './inventory-store'
import type { HostServiceKind } from '../shared/inventory'
import {
  classifyCommandFailure,
  explainFailedCommand,
  explainRetryBudgetStop,
  observeRetryBudget,
  readConfirmedCommandOutcome,
  retryWritePermitted,
  type CommandFailureEvidence,
  type RetryBudgetSignal
} from './core-a-command-failure'
import {
  citeHeldPatchDraft,
  emptyCiteWindow,
  emptyOutputView,
  explainCiteableOutput,
  truncateCiteableOutput,
  type OutputView
} from './core-a-output-truncate'

function send(wc: WebContents, ev: AiStreamEvent): void {
  if (!wc.isDestroyed()) wc.send('ai:stream', ev)
  if (ev.type === 'debug') forwardDebugPayloadToWindow(ev.payload)
}

const DEBUG_AI =
  process.env.AISS_LOG_AI_INTERACTIONS === '1' || process.env.AISS_LOG_AI === '1' || process.env.NODE_ENV === 'development'

function logAi(...args: unknown[]): void {
  if (!DEBUG_AI) return
  // Keep logs ASCII to avoid terminal encoding issues.
  console.log('[ai-log]', ...args)
}

function trimForLog(s: string, max = 2000): string {
  const t = s.replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return t.slice(0, max) + `...(trimmed ${t.length - max} chars)`
}

function lastUserQuestionForDebug(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      const c = messages[i].content?.trim() ?? ''
      return c.length > 800 ? `${c.slice(0, 800)}…` : c || mt('(空)', "(empty)")
    }
  }
  return mt('(无用户消息)', "(no user message)")
}

function cloneChatMessages(m: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
  return JSON.parse(JSON.stringify(m)) as Array<{ role: string; content: string }>
}

function capDebugDetail(s: string, max = 12000): string {
  if (s.length <= max) return s
  return mt(`${s.slice(0, max)}\n…(已截断，共 ${s.length} 字符)`, `${s.slice(0, max)}\n…(truncated, ${s.length} characters total)`)
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}...`
}

type ConfirmOutcome = 'approve' | 'deny' | 'cancel'

const confirmWaiters = new Map<string, { resolve: (outcome: ConfirmOutcome) => void; timer: NodeJS.Timeout }>()

type ActiveAiChat = { ac: AbortController; ctx: { userAborted: boolean } }
let activeAiChat: ActiveAiChat | null = null

function settleConfirm(requestId: string, outcome: ConfirmOutcome): boolean {
  const rec = confirmWaiters.get(requestId)
  if (!rec) return false
  confirmWaiters.delete(requestId)
  clearTimeout(rec.timer)
  rec.resolve(outcome)
  return true
}

/** 停止当前一轮 AI 助手（中断模型请求、解除等待中的命令确认） */
export function abortAiChat(): void {
  const cur = activeAiChat
  if (!cur) return
  cur.ctx.userAborted = true
  cur.ac.abort()
  for (const [requestId] of [...confirmWaiters.entries()]) settleConfirm(requestId, 'cancel')
}

/** Waiting confirms. A cancel or abort must leave this at 0 so the next turn is not stuck. */
export function pendingAiConfirmCount(): number {
  return confirmWaiters.size
}

function isAbortError(e: unknown): boolean {
  if (e instanceof Error && e.name === 'AbortError') return true
  return typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError'
}

function confirmTimeoutMs(): number {
  const raw = process.env.AISS_CONFIRM_TIMEOUT_MS
  const n = raw ? Number(raw) : NaN
  if (!Number.isFinite(n) || n <= 0) return 10 * 60 * 1000
  return n
}

export function resolveAiConfirmStep(requestId: string, ok: boolean): boolean {
  return settleConfirm(requestId, ok ? 'approve' : 'deny')
}

/** Drop a waiting interrupt without recording a deny. The step must not run. */
export function cancelAiConfirmStep(requestId: string): boolean {
  return settleConfirm(requestId, 'cancel')
}

async function waitForAiConfirm(requestId: string): Promise<ConfirmOutcome> {
  const timeout = confirmTimeoutMs()
  return await new Promise<ConfirmOutcome>((resolve) => {
    const timer = setTimeout(() => {
      confirmWaiters.delete(requestId)
      resolve('deny')
    }, timeout)
    confirmWaiters.set(requestId, { resolve, timer })
  })
}

function normalizeRiskLevel(raw: unknown): 'low' | 'medium' | 'high' {
  const s = String(raw ?? '').trim()
  const t = s.toLowerCase()
  if (!t) return 'medium'
  if (t === 'low' || t === '低') return 'low'
  if (t === 'medium' || t === 'med' || t === '中' || t === '中等') return 'medium'
  if (t === 'high' || t === '高') return 'high'
  // Unknown value: default to medium to avoid breaking the step.
  return 'medium'
}

type CoreSessionState = {
  notes: string[]
  recentActions: string[]
  recentCommands: string[]
  observations: string[]
  taskGraph: TaskNode[]
  nextTaskId: number
  failureStreak: number
  lastToolScore?: ToolScore
  repeatActionCount: number
  lastActionFingerprint: string | null
}

type TaskNodeStatus = 'open' | 'in_progress' | 'blocked' | 'done'
type TaskNode = {
  id: string
  title: string
  status: TaskNodeStatus
  confidence: number
  updatedAt: number
}

type ToolScore = {
  score: number
  level: 'low' | 'medium' | 'high'
  reason: string
}

const coreStateBySession = new Map<string, CoreSessionState>()
const sessionEpochAtLoad = new Map<string, number>()

onThreadContextCleared((key) => {
  coreStateBySession.delete(key)
  sessionEpochAtLoad.delete(key)
})

function getSessionState(targetSessionId?: string): CoreSessionState {
  const key = targetSessionId?.trim() || 'global'
  const existing = coreStateBySession.get(key)
  if (existing) return existing
  sessionEpochAtLoad.set(key, currentThreadEpoch(key))

  const persisted = loadPersistedCoreSession(key)
  const created: CoreSessionState = {
    notes: persisted?.notes ?? [],
    recentActions: [],
    recentCommands: persisted?.recentCommands ?? [],
    observations: persisted?.observations ?? [],
    taskGraph: [],
    nextTaskId: 1,
    failureStreak: 0,
    repeatActionCount: 0,
    lastActionFingerprint: null
  }
  if (persisted?.taskSummaries?.length) {
    const validStatus = new Set<TaskNodeStatus>(['open', 'in_progress', 'blocked', 'done'])
    for (const line of persisted.taskSummaries) {
      const m = /^\[(\w+)\]\s*(.+)$/.exec(line)
      if (m) {
        const st = m[1] as TaskNodeStatus
        created.taskGraph.push({
          id: `T${created.nextTaskId++}`,
          title: m[2]!.trim().slice(0, 120) || mt('历史任务', "Past task"),
          status: validStatus.has(st) ? st : 'open',
          confidence: 0.5,
          updatedAt: persisted.updatedAt
        })
      }
    }
  }
  coreStateBySession.set(key, created)
  return created
}

function persistSessionState(targetSessionId: string | undefined, state: CoreSessionState): void {
  const key = targetSessionId?.trim() || 'global'
  savePersistedCoreSession(
    key,
    {
      notes: state.notes,
      recentCommands: state.recentCommands,
      observations: state.observations,
      taskGraph: state.taskGraph.map((t) => ({ title: t.title, status: t.status }))
    },
    sessionEpochAtLoad.get(key) ?? 0
  )
}

function rememberArchivedGoal(state: CoreSessionState, goal: string): void {
  const archived = formatArchivedGoal(goal)
  rememberNote(state, archived.note)
  const title = truncate(goal, 120)
  if (!title || state.taskGraph.some((task) => task.title === title)) return
  state.taskGraph.push({
    id: `T${state.nextTaskId++}`,
    title,
    status: 'done',
    confidence: 0.5,
    updatedAt: Date.now()
  })
  if (state.taskGraph.length > 10) state.taskGraph = state.taskGraph.slice(-10)
}

function lastUserQuestion(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content?.trim() ?? ''
  }
  return ''
}

type PlannerTurn = TranscriptTurn

function appendObservation(state: CoreSessionState, snapshot: string, command?: string | null): void {
  const raw = snapshot.trim()
  if (!raw || raw.includes('暂无缓冲') || raw.includes('No buffered output') || raw.includes('无法读取')) return
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const tail = lines.slice(-4).join(' | ')
  const view = truncateCiteableOutput(raw)
  const scarce = view.citeWindow.outsideHeadTail.filter((marker) => !tail.includes(marker))
  let body = [scarce.join(' '), tail].filter(Boolean).join(' ')
  for (const filler of view.citeWindow.droppedFiller) body = body.split(filler).join('')
  const head = command ? `cmd=${command}: ` : ''
  const obs = truncate(`${head}${body}`, 240)
  if (!obs) return
  state.observations.push(obs)
  if (state.observations.length > 10) state.observations = state.observations.slice(-10)
}

async function captureTerminalSnapshot(
  ssh: SshSessionManager,
  sessionId: string,
  preferFromCommand: boolean
): Promise<string | null> {
  const snap = ssh.getRingSnapshot(sessionId, {
    maxLines: 1000,
    fromCurrentCommand: preferFromCommand,
    includeCommandLine: true
  })
  if (snap == null || !snap.trim()) return null
  let text = snap.trimEnd()
  if (preferFromCommand && text.includes('（命令已发送，暂未捕获到后续输出）')) {
    await new Promise<void>((r) => setTimeout(r, 500))
    const retry = ssh.getRingSnapshot(sessionId, {
      maxLines: 1000,
      fromCurrentCommand: true,
      includeCommandLine: true
    })
    if (retry?.trim()) text = retry.trimEnd()
  }
  return text
}

function settleMsAfterCommand(): number {
  const raw = process.env.AISS_COMMAND_SETTLE_MS
  const n = raw ? Number(raw) : 800
  return Number.isFinite(n) && n >= 200 ? Math.min(5000, Math.floor(n)) : 800
}

function shouldEvidenceGateEnd(
  userQuestion: string,
  state: CoreSessionState,
  hasTerminalExcerpt: boolean
): boolean {
  if (hasTerminalExcerpt) return false
  const score = state.lastToolScore?.score
  if (score != null && score >= 0.55) return false
  const q = userQuestion.trim()
  if (!q) return false
  return /查|看|分析|排查|诊断|为什么|错误|异常|状态|日志|help|check|debug|fix|issue/i.test(q)
}

function rememberNote(state: CoreSessionState, text: string): void {
  const note = truncate(text.replace(/\s+/g, ' '), 280)
  if (!note) return
  state.notes.push(note)
  if (state.notes.length > 8) state.notes = state.notes.slice(-8)
}

function rememberAction(state: CoreSessionState, action: string): void {
  state.recentActions.push(action)
  if (state.recentActions.length > 8) state.recentActions = state.recentActions.slice(-8)
}

function rememberCommand(state: CoreSessionState, command: string): void {
  const cmd = truncate(command.replace(/\s+/g, ' '), 220)
  if (!cmd) return
  state.recentCommands.push(cmd)
  if (state.recentCommands.length > 6) state.recentCommands = state.recentCommands.slice(-6)
}

/**
 * The cancelled proposal was recorded before the human answered. Drop that
 * bookkeeping so it is not an executed command, a note, or an open task.
 * Earlier approved steps stay.
 */
function releaseCancelledProposal(
  state: CoreSessionState,
  parsed: AiAssistantReply,
  mark: { tasks: TaskNode[] }
): void {
  const note = truncate(parsed.description.replace(/\s+/g, ' '), 280)
  if (note && state.notes[state.notes.length - 1] === note) state.notes.pop()
  if (state.recentActions[state.recentActions.length - 1] === parsed.action) state.recentActions.pop()
  const title = truncate(parsed.description, 90)
  const last = state.taskGraph[state.taskGraph.length - 1]
  if (title && last && last.title === title && last.status === 'open') state.taskGraph.pop()
  for (const saved of mark.tasks) {
    const live = state.taskGraph.find((task) => task.id === saved.id)
    if (!live) continue
    live.status = saved.status
    live.confidence = saved.confidence
    live.updatedAt = saved.updatedAt
  }
  const cmd = (parsed.command ?? '').replace(/[\r\n]+/g, ' ').trim()
  if (!cmd) return
  state.recentCommands = state.recentCommands.filter((item) => item !== cmd)
}

function summarizeTaskGraph(state: CoreSessionState): string {
  if (state.taskGraph.length === 0) return mt('（暂无）', "(none)")
  return state.taskGraph
    .slice(-6)
    .map((t) => mt(`- [${t.status}] ${t.title} (置信度 ${Math.round(t.confidence * 100)}%)`, `- [${t.status}] ${t.title} (confidence ${Math.round(t.confidence * 100)}%)`))
    .join('\n')
}

function ensureSeedTask(state: CoreSessionState, userQuestion: string): void {
  if (state.taskGraph.length > 0) return
  const title = truncate(userQuestion || mt('解决用户当前问题', "Solve the user's current problem"), 120)
  state.taskGraph.push({
    id: `T${state.nextTaskId++}`,
    title: title || mt('解决用户当前问题', "Solve the user's current problem"),
    status: 'open',
    confidence: 0.4,
    updatedAt: Date.now()
  })
}

function updateTaskGraphOnAction(state: CoreSessionState, action: AiAssistantReply): void {
  const now = Date.now()
  const active = state.taskGraph.find((t) => t.status === 'in_progress') ?? state.taskGraph.find((t) => t.status === 'open')
  if (!active) return
  if (action.action === 'tool_call') {
    active.status = 'in_progress'
    active.confidence = Math.min(0.95, active.confidence + 0.08)
    active.updatedAt = now
    return
  }
  if (action.action === 'command') {
    active.status = 'in_progress'
    active.confidence = Math.min(0.95, active.confidence + 0.12)
    active.updatedAt = now
    const descTitle = truncate(action.description, 90)
    if (descTitle && state.taskGraph.every((t) => t.title !== descTitle)) {
      state.taskGraph.push({
        id: `T${state.nextTaskId++}`,
        title: descTitle,
        status: 'open',
        confidence: 0.45,
        updatedAt: now
      })
    }
    if (state.taskGraph.length > 10) state.taskGraph = state.taskGraph.slice(-10)
    return
  }
  if (action.action === 'end') {
    active.status = 'done'
    active.confidence = Math.max(active.confidence, 0.9)
    active.updatedAt = now
  }
}

function scoreToolSnapshot(snapshot: string, lastCommand: string | null): ToolScore {
  const raw = snapshot.trim()
  if (!raw || raw.includes('暂无缓冲输出') || raw.includes('No buffered output') || raw.includes('无法读取终端快照') || raw.includes('cannot read the terminal snapshot')) {
    return { score: 0.15, level: 'high', reason: mt('快照为空或会话不可用', "Snapshot is empty or the session is unavailable") }
  }
  const lineCount = raw.split(/\r?\n/).length
  const hasError = /\b(error|failed|denied|not found|traceback|exception)\b/i.test(raw)
  const hasPrompt = /[$#>]\s*$/.test(raw) || /\[[^\]]+@\w+/.test(raw)
  const containsCmd = lastCommand ? raw.toLowerCase().includes(lastCommand.toLowerCase()) : false

  let score = 0.35
  if (lineCount >= 5) score += 0.2
  if (lineCount >= 20) score += 0.15
  if (containsCmd) score += 0.15
  if (hasPrompt) score += 0.1
  if (hasError) score += 0.1
  score = Math.min(1, Math.max(0, score))

  if (score >= 0.75) return { score, level: 'low', reason: mt('快照信息充分，可继续决策', "Snapshot is informative enough to continue") }
  if (score >= 0.5) return { score, level: 'medium', reason: mt('快照信息一般，建议补充证据', "Snapshot is so-so; consider gathering more evidence") }
  return { score, level: 'high', reason: mt('快照信息不足，可能需要替代策略', "Snapshot is insufficient; an alternative approach may be needed") }
}

const assistantStepSchema = z
  .object({
    description: z
      .string()
      .describe(
        '结论、步骤或原因。多条列举必须使用真实换行分隔，例如 1) …\\n2) …\\n3) …。当 action 为 tool_call/command 时说明为何需要以及风险等级。不要用 Markdown 围栏。'
      ),
    action: z.enum(['tool_call', 'command', 'end']).describe('下一步动作：tool_call/command/end'),
    completed: z.boolean().optional().describe('任务是否已完成；若 action=end 通常为 true'),
    toolName: z.string().optional().describe(
      'tool_call 时：get_terminal_snapshot | get_host_inventory | upsert_host_service | append_host_note'
    ),
    toolInput: z
      .object({
        maxLines: z.number().int().min(1).max(2000).optional(),
        fromCurrentCommand: z.boolean().optional(),
        includeCommandLine: z.boolean().optional(),
        hostId: z.string().optional(),
        query: z.string().optional(),
        note: z.string().optional(),
        serviceName: z.string().optional(),
        serviceKind: z.string().optional(),
        servicePorts: z.array(z.number()).optional(),
        serviceNotes: z.string().optional()
      })
      .optional()
      .describe('tool_call 输入'),
    command: z
      .string()
      .optional()
      .describe('当 action=command 时：建议执行的单行命令；禁止换行；不要带多余解释'),
    riskLevel: z.preprocess(
      (v) => normalizeRiskLevel(v),
      z.enum(['low', 'medium', 'high'])
    ).default('medium').describe('风险等级'),
    notes: z.string().optional().describe('补充注意点、回滚、备份或需先确认的信息')
  })
  .superRefine((v, ctx) => {
    if (v.action === 'tool_call') {
      if (!v.toolName || !v.toolName.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toolName'], message: mt('tool_call 必须给出 toolName', "tool_call must include toolName") })
      }
    }
    if (v.action === 'command') {
      if (!v.command || !v.command.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['command'], message: mt('command 必须给出 command', "command must include command") })
      }
    }
    if (v.action === 'end') {
      if (v.command && v.command.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['command'], message: mt('end 不应给出 command', "end must not include command") })
      }
    }
  })

function extractJsonObject(text: string): string {
  let s = text.trim()
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im
  const fm = s.match(fence)
  if (fm) s = fm[1].trim()

  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  return s
}

function pickStringField(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function inferActionFromRaw(obj: Record<string, unknown>): AiAssistantReply['action'] {
  const a = pickStringField(obj, ['action'])
  if (a === 'tool_call' || a === 'command' || a === 'end') return a
  if (pickStringField(obj, ['command', 'cmd'])) return 'command'
  if (pickStringField(obj, ['toolName', 'tool'])) return 'tool_call'
  if (obj.completed === true) return 'end'
  return 'end'
}

/** 兼容模型漏字段/别名字段，避免 Zod 因 description 缺失直接失败 */
function normalizeAssistantStepRaw(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj }
  const action = inferActionFromRaw(out)

  let description = pickStringField(out, ['description', 'message', 'summary', 'reasoning', 'reason', 'text', 'content', 'explanation'])
  const command = pickStringField(out, ['command', 'cmd'])
  const toolName = pickStringField(out, ['toolName', 'tool']) || 'get_terminal_snapshot'
  const notes = pickStringField(out, ['notes', 'note', 'comment'])

  if (!description) {
    if (action === 'command' && command) description = mt(`建议执行命令：${command}`, `Suggested command: ${command}`)
    else if (action === 'tool_call') description = mt('需要读取终端快照以获取最新证据', "Need to read the terminal snapshot for the latest evidence")
    else if (notes) description = notes
    else description = mt('根据当前上下文继续分析', "Continue analysis based on the current context")
  }

  out.action = action
  out.description = description
  if (notes) out.notes = notes
  if (action === 'command' && command) out.command = command
  if (action === 'tool_call') {
    out.toolName = toolName
    if (out.toolInput == null || typeof out.toolInput !== 'object') {
      out.toolInput = { maxLines: 800, fromCurrentCommand: true, includeCommandLine: true }
    }
  }
  if (action === 'end') {
    out.completed = out.completed ?? true
    delete out.command
    delete out.toolName
    delete out.toolInput
  }
  if (out.riskLevel == null || String(out.riskLevel).trim() === '') out.riskLevel = 'medium'

  return out
}

function formatParseError(e: unknown): string {
  if (e instanceof z.ZodError) {
    const lines = e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    return mt(`模型 JSON 字段不符合约定：${lines.join('；')}`, `Model JSON fields do not match the contract: ${lines.join('；')}`)
  }
  return e instanceof Error ? e.message : String(e)
}

/** 供脚本自测；生产路径见 runOpenClawCoreAgentChat */
export function parseAssistantStep(content: string): { structured: AiAssistantReply | null; parseError?: string } {
  const jsonText = extractJsonObject(content)
  try {
    const raw = JSON.parse(jsonText) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { structured: null, parseError: mt('模型返回的不是 JSON 对象', "The model did not return a JSON object") }
    }
    const normalized = normalizeAssistantStepRaw(raw as Record<string, unknown>)
    const parsed = assistantStepSchema.parse(normalized) as unknown as AiAssistantReply
    const completed = typeof parsed.completed === 'boolean' ? parsed.completed : parsed.action === 'end'
    return { structured: { ...parsed, completed }, parseError: undefined }
  } catch (e) {
    const loose = parseAiAssistantReply(content)
    if (loose) {
      return { structured: loose, parseError: mt(`严格校验失败，已宽松恢复：${formatParseError(e)}`, `Strict validation failed, recovered loosely: ${formatParseError(e)}`) }
    }
    return { structured: null, parseError: formatParseError(e) }
  }
}

function buildCoreSystemPrompt(
  payload: AiChatPayload,
  state: CoreSessionState,
  ctx: {
    step: number
    userQuestion: string
    lastToolResult?: string | null
    lastCommand?: string | null
    lastWriteOk?: boolean | null
    plannerHint?: string | null
    memoryBlocks?: string | null
    /** Structured failure of the last confirmed command. Empty when that command did not fail. */
    commandFailure?: string | null
    /** Consecutive failures of that command. Present on every step; the prompt cites it after a failure. */
    retryBudget?: RetryBudgetSignal | null
    /** The snapshot above is a capped view of a longer stdout, stderr, or ring. */
    outputTruncated?: boolean
  }
): string {
  const memorySection = state.notes.length > 0 ? state.notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : mt('（暂无）', "(none)")
  const recentCmdSection = state.recentCommands.length > 0 ? state.recentCommands.map((c) => `- ${c}`).join('\n') : mt('（暂无）', "(none)")
  const obsSection =
    state.observations.length > 0 ? state.observations.map((o, i) => `${i + 1}. ${o}`).join('\n') : mt('（暂无）', "(none)")
  const taskGraphSection = summarizeTaskGraph(state)
  const lastScoreSection = state.lastToolScore
    ? mt(`${Math.round(state.lastToolScore.score * 100)} 分 / 风险 ${state.lastToolScore.level} / ${state.lastToolScore.reason}`, `${Math.round(state.lastToolScore.score * 100)} pts / risk ${state.lastToolScore.level} / ${state.lastToolScore.reason}`)
    : mt('（暂无）', "(none)")

  const parts: string[] = [
    buildBootstrapPrompt(ctx.userQuestion),
    ...(ctx.memoryBlocks?.trim() ? [ctx.memoryBlocks.trim()] : []),
    '---',
    mt('你必须输出单个 JSON 对象；禁止 Markdown、代码围栏以及 JSON 外文字。', "Output a single JSON object; no Markdown, no code fences, no text outside the JSON."),
    mt(
      'description 中的列举必须使用真实换行，例如 1) …\\n2) …\\n3) …。仍禁止 Markdown 围栏，禁止 JSON 以外的文字。',
      'In description, separate list items with a real newline, for example 1) …\\n2) …\\n3) …. Still no Markdown fences and no text outside the JSON.'
    ),
    mt('action（必填）：tool_call | command | end。', "action (required): tool_call | command | end."),
    mt('command 一律需要用户确认后才执行，包括 riskLevel=low，不会自动写入终端；get_terminal_snapshot 由系统自动执行。', "Every command, including riskLevel=low, runs only after user confirmation and is never written to the terminal automatically; get_terminal_snapshot is executed by the system automatically."),
    mt('可用 toolName：get_terminal_snapshot | get_host_inventory | upsert_host_service | append_host_note。', "Available toolName: get_terminal_snapshot | get_host_inventory | upsert_host_service | append_host_note."),
    mt('若上一轮刚执行过命令，系统可能已自动附带终端观测结果，请优先阅读后再决策。', "If a command just ran in the previous round, terminal observations may be attached automatically; read them before deciding."),
    mt(`当前轮次：${ctx.step}`, `Current round: ${ctx.step}`),
    mt('工作区观测笔记（跨轮持久）：', "Workspace observation notes (persist across rounds):"),
    obsSection,
    mt('最近核心记忆：', "Recent core memory:"),
    memorySection,
    mt('最近已执行命令：', "Recently executed commands:"),
    recentCmdSection,
    mt('任务图（Task Graph）：', "Task graph:"),
    taskGraphSection,
    mt('最近工具结果评分：', "Latest tool result score:"),
    lastScoreSection,
    mt(`当前失败连续计数：${state.failureStreak}`, `Consecutive failures: ${state.failureStreak}`),
    mt('JSON 字段（description 与 action 必填）：description, action, completed, toolName, toolInput, command, riskLevel, notes。', "JSON fields (description and action required): description, action, completed, toolName, toolInput, command, riskLevel, notes.")
  ]

  if (ctx.plannerHint) {
    parts.push(mt(`本轮策略提示：${ctx.plannerHint}`, `Strategy hint for this round: ${ctx.plannerHint}`))
  }

  if (payload.targetSessionId) {
    parts.push(mt(`当前关联 SSH 会话：${payload.targetSessionId}。`, `Linked SSH session: ${payload.targetSessionId}.`))
  } else {
    parts.push(mt('当前未关联 SSH 会话：禁止 get_terminal_snapshot；仍可读写主机知识库或给出本地自检建议，或直接 end。', "No SSH session linked: get_terminal_snapshot is not allowed; you may still read/write the host inventory, suggest local checks, or end."))
  }

  const inv = getInventoryStore()
  const hostCtx = inv.formatContext({
    hostId: payload.hostInventoryId,
    host: payload.inventoryLookup?.host,
    port: payload.inventoryLookup?.port,
    profileId: payload.inventoryLookup?.profileId
  })
  if (hostCtx) {
    parts.push(mt('当前主机知识库档案（本地 Inventory，可信运维事实）：\n', "Current host inventory profile (local inventory, trusted ops facts):") + hostCtx)
  } else {
    parts.push(
      mt('当前未命中主机知识库档案。若用户描述的是某台已知机器，可用 get_host_inventory 搜索；发现服务后可用 upsert_host_service / append_host_note 登记。', "No host inventory profile matched. If the user describes a known machine, search with get_host_inventory; register discovered services with upsert_host_service / append_host_note.")
    )
  }

  if (payload.terminalExcerpt?.trim()) {
    parts.push(mt('用户附带终端片段：\n```\n', "Terminal excerpt attached by the user:\n```") + payload.terminalExcerpt.trim() + '\n```')
  }

  if (ctx.lastToolResult != null) {
    parts.push(mt('最近一次终端快照：\n```\n', "Latest terminal snapshot:\n```") + (ctx.lastToolResult.trim() ? ctx.lastToolResult.trim() : mt('（空）', "(empty)")) + '\n```')
    if (ctx.outputTruncated) {
      parts.push(
        mt(
          '终端输出已截断。只能引用上面保留的证据记号，不要编造被截掉的行。',
          'Terminal output was truncated. Cite only the evidence tokens that remain above. Do not invent a line that was cut.'
        )
      )
    }
  }

  if (ctx.lastCommand) {
    parts.push(mt(`上一条命令已发送（writeOk=${ctx.lastWriteOk === true ? 'true' : 'false'}）：\n\`\`\`\n${ctx.lastCommand}\n\`\`\``, `Previous command sent (writeOk=${ctx.lastWriteOk === true ? 'true' : 'false'}):\n\`\`\`\n${ctx.lastCommand}\n\`\`\``))
  }

  if (ctx.commandFailure?.trim()) {
    const budget = ctx.retryBudget
    const budgetLine =
      budget && budget.count > 0
        ? mt(
            `\n重试预算 count=${budget.count} cap=${budget.cap} exhausted=${budget.exhausted ? 'true' : 'false'} nearBudget=${budget.nearBudget ? 'true' : 'false'}`,
            `\nretryBudget count=${budget.count} cap=${budget.cap} exhausted=${budget.exhausted ? 'true' : 'false'} nearBudget=${budget.nearBudget ? 'true' : 'false'}`
          )
        : ''
    const exhaustedLine = budget?.exhausted
      ? mt('\n超限停：不要再写这条命令。', '\nOver budget: do not write this command again.')
      : ''
    parts.push(
      mt(
        `上一条已确认命令失败（禁止自动重跑，重试须新的确认）：\n${ctx.commandFailure.trim()}${budgetLine}${exhaustedLine}`,
        `The last confirmed command failed (do not run it again; a retry needs a new confirmation):\n${ctx.commandFailure.trim()}${budgetLine}${exhaustedLine}`
      )
    )
  }

  return parts.join('\n')
}

async function callCorePlannerJson(params: {
  apiKey: string
  baseURL: string
  model: string
  temperature: number
  messages: Array<{ role: string; content: string }>
  timeoutMs: number
  userAbortSignal?: AbortSignal
}): Promise<string> {
  const { apiKey, baseURL, model, temperature, messages, timeoutMs, userAbortSignal } = params
  const url = `${baseURL.replace(/\/$/, '')}/chat/completions`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onUserAbort = (): void => {
    controller.abort()
  }
  if (userAbortSignal) {
    if (userAbortSignal.aborted) {
      clearTimeout(timer)
      throw new DOMException('Aborted', 'AbortError')
    }
    userAbortSignal.addEventListener('abort', onUserAbort)
  }

  const baseBody: Record<string, unknown> = { model, messages, temperature }

  async function post(withResponseFormat: boolean): Promise<Response> {
    const body: Record<string, unknown> = { ...baseBody }
    if (withResponseFormat) body.response_format = { type: 'json_object' }
    return await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  }

  try {
    let res = await post(true)
    if (!res.ok && res.status === 400) {
      // Retry without response_format for providers that don't support it.
      res = await post(false)
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${t.slice(0, 500)}`)
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') throw new Error(mt('模型未返回有效 content', "The model returned no valid content"))
    return content
  } catch (e) {
    if (isAbortError(e)) {
      if (userAbortSignal?.aborted) throw e
      throw new Error(mt(`请求超时（${timeoutMs}ms）`, `Request timed out (${timeoutMs}ms)`))
    }
    throw e
  } finally {
    clearTimeout(timer)
    userAbortSignal?.removeEventListener('abort', onUserAbort)
  }
}

export async function runOpenClawCoreAgentChat(
  wc: WebContents,
  settings: AiSettings,
  payload: AiChatPayload,
  ssh: SshSessionManager
): Promise<void> {
  const provider = settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
  if (!provider) {
    send(wc, { type: 'error', message: mt('未找到有效的 AI Provider 配置', "No valid AI provider configuration found") })
    return
  }

  const apiKey = provider.apiKey.trim()
  if (!apiKey) {
    send(wc, {
      type: 'error',
      message: mt('请先填写 API Key（OpenClaw 风格核心会直接使用当前 Provider）。', "Please enter an API key first (the OpenClaw-style core uses the current provider directly).")
    })
    return
  }

  const baseURL = provider.baseURL.replace(/\/$/, '')
  const temperature =
    typeof settings.temperature === 'number' && Number.isFinite(settings.temperature) ? Math.min(2, Math.max(0, settings.temperature)) : 0.1

  const targetSessionId = payload.targetSessionId

  const timeoutMs = (() => {
    const raw = process.env.AISS_LANGGRAPH_TIMEOUT_MS
    const n = raw ? Number(raw) : 45000
    return Number.isFinite(n) && n > 0 ? n : 45000
  })()

  const maxSteps = (() => {
    const raw = process.env.AISS_MAX_POLLS
    const n = raw ? Number(raw) : 10
    return Number.isFinite(n) && n > 0 ? Math.min(10, Math.floor(n)) : 10
  })()

  const pollWaitMs = (() => {
    const raw = process.env.AISS_POLL_WAIT_MS
    const n = raw ? Number(raw) : 1500
    return Number.isFinite(n) && n >= 0 ? n : 1500
  })()

  let conversation: PlannerTurn[] = payload.messages.map((m) => ({
    role: m.role,
    content: m.content
  }))
  const userQuestion = lastUserQuestion(conversation)
  const sessionKey = payload.targetSessionId?.trim() || 'global'
  const sessionState = getSessionState(payload.targetSessionId)
  ensureSeedTask(sessionState, userQuestion || lastUserQuestionForDebug(payload.messages))
  const threadId = resolveThreadId({
    historyKey: payload.historyKey,
    targetSessionId: payload.targetSessionId
  })
  let { ctx: thread, epoch: threadEpoch } = loadThreadContext(threadId)
  const absorbed = absorbUserTurn(thread, conversation)
  thread = absorbed.ctx
  if (absorbed.switchedFrom) {
    rememberArchivedGoal(sessionState, absorbed.switchedFrom.goal)
    if (threadId !== sessionKey) {
      const archived = formatArchivedGoal(absorbed.switchedFrom.goal)
      appendStoredArchive(threadId, archived.note, archived.taskSummary, threadEpoch)
    }
  }
  logAi('ai:engine core-a', { session: payload.targetSessionId ?? 'global', thread: threadId })
  const debugTurnId = payload.debugTurnId?.trim() ?? ''
  const debugUserQuestion = lastUserQuestionForDebug(payload.messages)
  const emitDebug = (entry: AiDebugEntry): void => {
    if (!debugTurnId) return
    send(wc, { type: 'debug', payload: { debugTurnId, userQuestion: debugUserQuestion, entry } })
  }

  let lastToolResult: string | null = null
  let lastCommand: string | null = null
  let lastWriteOk: boolean | null = null
  let lastFailure: (CommandFailureEvidence & { requestId: string; count: number }) | null = null
  const writtenRequestIds = new Set<string>()
  const inFlight = createInFlightBook()

  if (activeAiChat) {
    abortAiChat()
  }
  const runCtx = { userAborted: false }
  const ac = new AbortController()
  activeAiChat = { ac, ctx: runCtx }

  let prevSnapFingerprint: string | null = null
  let sameSnapshotRepeat = 0
  let consecutiveSnapshotTools = 0
  let evidenceGateUsed = false
  const MAX_SAME_SNAPSHOT_REPEAT = 2
  const MAX_CONSECUTIVE_SNAPSHOT_TOOLS = 6

  const persistAll = (): void => {
    persistSessionState(payload.targetSessionId, sessionState)
    saveThreadContext(threadId, thread, threadEpoch)
  }

  if (targetSessionId && !payload.terminalExcerpt?.trim()) {
    const bootSnap = await captureTerminalSnapshot(ssh, targetSessionId, true)
    if (bootSnap) {
      lastToolResult = bootSnap
      prevSnapFingerprint = bootSnap
      sessionState.lastToolScore = scoreToolSnapshot(bootSnap, null)
      appendObservation(sessionState, bootSnap, null)
      rememberNote(sessionState, mt('会话启动时已自动读取终端上下文', "Terminal context was read automatically at session start"))
    }
  }

  try {
    for (let step = 1; step <= maxSteps; step++) {
      const compacted = compactTranscript(conversation, thread)
      conversation = compacted.recent
      thread = compacted.ctx
      if (runCtx.userAborted) {
        send(wc, { type: 'cancelled', message: mt('已停止生成', "Generation stopped") })
        send(wc, { type: 'done' })
        return
      }

      send(wc, { type: 'status', text: mt(`正在生成第 ${step} 步...`, `Generating step ${step}...`) })
      if (sessionState.failureStreak >= 2) {
        rememberNote(sessionState, mt('检测到连续失败，下一步应优先选择低风险证据命令或直接结束并说明缺失信息。', "Repeated failures detected; next prefer a low-risk evidence command or end and explain what is missing."))
      }

      const retryBudget = observeRetryBudget(lastFailure?.count ?? 0, lastFailure?.command ?? '')
      let plannerHint: string | null = null
      if (lastFailure && retryBudget.exhausted) {
        plannerHint = mt(
          '同一命令的重试预算已用尽。禁止再写这条命令，不要自动重跑。请结束，并说明失败证据；证据不足，需要人工处理。',
          'The retry budget for this command is exhausted. Do not write it again and do not run it automatically. End, cite the failure evidence, and say evidence is insufficient so a person needs to decide.'
        )
      } else if (lastFailure) {
        plannerHint = mt(
          '上一条已确认命令失败。说明里要引用失败证据，禁止自动重跑。同一命令只有在新的确认之后才能再写。',
          'The last confirmed command failed. Cite the failure evidence. Do not run it again. The same command can be written only after a new confirmation.'
        )
      } else if (!lastToolResult && targetSessionId && step <= 2) {
        plannerHint = mt('尚无终端证据，本轮应优先 tool_call(get_terminal_snapshot)，不要直接 command。', "No terminal evidence yet; this round should prefer tool_call(get_terminal_snapshot) rather than a command.")
      } else if (lastCommand && lastToolResult) {
        plannerHint = mt('上一条命令已执行且已有自动观测，请基于快照给出结论或下一步；证据充分时请 end。', "The previous command ran and was observed automatically; give a conclusion or next step from the snapshot, and end when evidence is sufficient.")
      } else if (sessionState.failureStreak >= 2) {
        plannerHint = mt('连续失败：优先只读快照或低风险 command，避免重复相同动作。', "Consecutive failures: prefer a read-only snapshot or low-risk command and avoid repeating the same action.")
      }

      const recalled = recallEpisodes(userQuestion, thread.episodes, { topK: 5 })
      const memory = buildMemoryPromptBlocks({
        working: thread.workingMemory,
        observations: thread.observationalMemory,
        runningSummary: thread.runningSummary,
        hits: recalled,
        headings: {
          working: mt('工作记忆（当前目标）：', 'Working memory (current goal):'),
          observations: mt('观测记忆（较早对话压缩）：', 'Observational memory (compressed older turns):'),
          summary: mt('较早对话摘要：', 'Earlier transcript summary:'),
          recall: mt('相关历史回忆：', 'Recalled history:')
        }
      })
      const outputView: OutputView = lastToolResult != null ? truncateCiteableOutput(lastToolResult) : emptyOutputView()
      const failureView = lastFailure ? truncateCiteableOutput(lastFailure.evidence) : null
      const sysPrompt = buildCoreSystemPrompt(payload, sessionState, {
        step,
        userQuestion,
        lastToolResult: lastToolResult != null ? outputView.text : null,
        lastCommand,
        lastWriteOk,
        plannerHint,
        memoryBlocks: memory.text,
        commandFailure: failureView ? failureView.text : null,
        retryBudget,
        outputTruncated: outputView.truncated
      })

      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: 'json' },
        { role: 'system', content: sysPrompt },
        ...conversation
      ]
      const recentChars = conversation.reduce((sum, turn) => sum + turn.content.length, 0)
      const budget = contextBudget({
        workingChars: memory.sections.working.length,
        workingItems: thread.workingMemory ? 1 : 0,
        observationChars: memory.sections.observations.length,
        observationItems: thread.observationalMemory.length,
        summaryChars: memory.sections.runningSummary.length,
        recallChars: memory.sections.recall.length,
        recallItems: recalled.length,
        recentChars,
        recentItems: conversation.length,
        systemChars: sysPrompt.length
      })
      const omBudget = observeOmBudget(thread)
      emitDebug({
        kind: 'context',
        round: step,
        slices: budget.slices,
        totalChars: budget.totalChars,
        omBudget,
        retryBudget,
        outputView: {
          truncated: outputView.truncated,
          originalChars: outputView.originalChars,
          shownChars: outputView.shownChars,
          cap: outputView.cap,
          markers: outputView.markers,
          tipSuggest: outputView.tipSuggest,
          rollback: outputView.rollback,
          citeWindow: outputView.citeWindow,
          citeHold: thread.citeHold ?? emptyCiteWindow()
        }
      })
      logAi('ai:om-budget', {
        bullets: omBudget.bullets,
        bulletCap: omBudget.bulletCap,
        bulletChars: omBudget.bulletChars,
        summaryChars: omBudget.summaryChars,
        droppedBullets: omBudget.droppedBullets,
        truncatedBullets: omBudget.truncatedBullets,
        summaryTruncated: omBudget.summaryTruncated,
        nearBudget: omBudget.nearBudget,
        truncated: omBudget.truncated
      })

      logAi('ai:step start', {
        step,
        targetSessionId: targetSessionId ?? null,
        model: settings.model,
        lastCommand: lastCommand ? trimForLog(lastCommand, 200) : null
      })

      const content = await callCorePlannerJson({
        apiKey,
        baseURL,
        model: settings.model,
        temperature,
        messages,
        timeoutMs,
        userAbortSignal: ac.signal
      })

      const { structured, parseError } = parseAssistantStep(content)

      if (!structured) {
        throw new Error(parseError ?? mt('模型返回 JSON 解析失败', "Failed to parse the model's JSON"))
      }

      let parsed = structured
      const proposedCommand =
        parsed.action === 'command' ? (parsed.command ?? '').replace(/[\r\n]+/g, ' ').trim() : ''
      const actionFingerprint = `${parsed.action}|${parsed.toolName ?? ''}|${(parsed.command ?? '').replace(/\s+/g, ' ').trim()}`
      if (sessionState.lastActionFingerprint === actionFingerprint) {
        sessionState.repeatActionCount += 1
      } else {
        sessionState.repeatActionCount = 0
      }
      sessionState.lastActionFingerprint = actionFingerprint
      if (sessionState.repeatActionCount >= 2) {
        parsed = {
          description: mt('检测到动作重复且没有新证据，已自动结束以避免无效循环。请补充关键终端输出后再继续。', "Repeated action without new evidence; ended automatically to avoid a useless loop. Add the key terminal output and continue."),
          action: 'end',
          completed: true,
          riskLevel: 'low',
          notes: mt('建议附带相关报错或执行结果，再发起下一轮。', "Attach the relevant error or command output before the next round.")
        }
      }

      let blockedByRetryBudget = false
      if (proposedCommand && lastFailure && proposedCommand === lastFailure.command) {
        const blocked = observeRetryBudget(lastFailure.count, lastFailure.command)
        if (blocked.exhausted) {
          blockedByRetryBudget = true
          parsed = {
            description: explainRetryBudgetStop(lastFailure, blocked),
            action: 'end',
            completed: true,
            riskLevel: 'low',
            notes: mt('同一失败路径已超过重试预算，未再写入。', 'The retry budget for this failed command is spent, so it was not written again.')
          }
          emitDebug({
            kind: 'execution',
            round: step,
            label: mt('重试预算已用尽', 'Retry budget exhausted'),
            detail: `blockedWrite=true retryBudget count=${blocked.count} cap=${blocked.cap} exhausted=true nearBudget=${String(blocked.nearBudget)} autoRetry=false\n${lastFailure.evidence}`
          })
        }
      }

      if (
        !blockedByRetryBudget &&
        parsed.action === 'end' &&
        !evidenceGateUsed &&
        targetSessionId &&
        shouldEvidenceGateEnd(userQuestion, sessionState, Boolean(payload.terminalExcerpt?.trim()))
      ) {
        evidenceGateUsed = true
        const gateSnap = await captureTerminalSnapshot(ssh, targetSessionId, true)
        if (gateSnap && gateSnap.trim()) {
          lastToolResult = gateSnap
          sessionState.lastToolScore = scoreToolSnapshot(gateSnap, lastCommand)
          appendObservation(sessionState, gateSnap, lastCommand)
          rememberNote(sessionState, mt('结束前轮询：证据不足，已自动补充终端观测', "Pre-end check: evidence insufficient, terminal observation added automatically"))
          send(wc, { type: 'status', text: mt('证据不足，已自动读取终端后继续分析…', "Evidence insufficient; read the terminal automatically and continuing…") })
          persistAll()
          await new Promise<void>((r) => setTimeout(r, 300))
          continue
        }
      }

      emitDebug({
        kind: 'model',
        round: step,
        model: `openclaw-core-a (${settings.model})`,
        temperature,
        requestMessages: cloneChatMessages(messages),
        responseRaw: content,
        structured: parsed,
        parseError
      })

      // Explicit HITL phases: planning → interrupted → resumed|cancelled → executing → observing.
      // Cancel (not deny) drops the proposal and returns to planning.
      // Read-only tools skip the interrupt. riskLevel and autoApproveLowRisk never skip it.
      // confirmBypassAllowed is always false; a future true would still fail closed below.
      void confirmBypassAllowed(settings.autoApproveLowRisk)
      const needsInterrupt = actionNeedsHumanInterrupt(parsed.action, parsed.toolName)
      let requestId = needsInterrupt ? randomUUID() : undefined
      let hitl: HitlLoopState = interruptForProposal(createHitlLoop(), {
        action: parsed.action,
        toolName: parsed.toolName,
        command: parsed.command,
        riskLevel: parsed.riskLevel,
        requestId,
        autoApproveLowRisk: settings.autoApproveLowRisk
      })
      if (needsInterrupt && sideEffectExecutionPermitted(hitl)) {
        send(wc, { type: 'error', message: mt('内部错误：命令在确认前进入了执行态', 'Internal error: command entered executing before confirm') })
        return
      }
      let safetyMode: SafetyMode | undefined
      let skipCommandWrite = false
      if (safetyTierEngaged(settings) && parsed.action === 'command') {
        const hostId =
          payload.safetyContext?.hostId ||
          payload.inventoryLookup?.profileId ||
          payload.historyKey ||
          payload.hostInventoryId
        const decision = planCommandConfirm({
          tier: effectiveSafetyTier(settings, {
            hostId,
            sessionId: payload.safetyContext?.sessionId || payload.historyKey
          }),
          command: parsed.command ?? '',
          riskLevel: parsed.riskLevel,
          production: payload.safetyContext?.production === true,
          hostId,
          hostName: payload.safetyContext?.hostName || payload.inventoryLookup?.host,
          allowHosts: settings.autopilotAllowHosts,
          allowHighRisk: settings.autopilotAllowHighRisk === true,
          book: inFlight
        })
        safetyMode = decision.mode
        if (decision.alternative) {
          const note = parsed.notes?.includes(decision.alternative)
            ? parsed.notes
            : [parsed.notes, decision.alternative].filter(Boolean).join('\n')
          parsed = { ...parsed, notes: note }
        }
        if (decision.mode === 'suggest' || decision.mode === 'hold') skipCommandWrite = true
        emitDebug({
          kind: 'execution',
          round: step,
          label: 'safety tier',
          detail: `mode=${decision.mode} tier=${decision.tier} applied=${decision.appliedTier} kind=${decision.kind} warn=${String(decision.warn)} write=${String(decision.write)}`
        })
      }
      if (needsInterrupt && safetyMode !== 'auto' && safetyMode !== 'suggest' && safetyMode !== 'hold') {
        emitDebug({
          kind: 'execution',
          round: step,
          label: 'HITL interrupt',
          detail: `phase=${hitl.phase} action=${parsed.action} risk=${parsed.riskLevel} safety=${safetyMode ?? 'legacy'}`
        })
      }

      if (parsed.action === 'end' && lastFailure) {
        const alreadyStopped =
          parsed.description.includes('重试预算已用尽') || parsed.description.includes('retry budget is exhausted')
        const failureForEnd = truncateCiteableOutput(lastFailure.evidence)
        parsed = {
          ...parsed,
          description: explainFailedCommand(
            parsed.description,
            failureForEnd.truncated ? { ...lastFailure, evidence: failureForEnd.text } : lastFailure,
            alreadyStopped
              ? ''
              : mt('不会自动重跑。若要再执行，需要新的确认。', 'This will not run again on its own. Another run needs a new confirmation.')
          )
        }
      }

      if (parsed.action === 'end' && (lastToolResult != null || thread.citeHold)) {
        const cited = lastToolResult != null ? truncateCiteableOutput(lastToolResult) : emptyOutputView()
        if (cited.truncated || thread.citeHold) {
          parsed = { ...parsed, description: explainCiteableOutput(parsed.description, cited, thread.citeHold) }
        }
      }
      if (parsed.action === 'end' && thread.citeHold) {
        parsed = { ...parsed, description: citeHeldPatchDraft(parsed.description, thread.citeHold) }
      }

      const emitRequestId =
        safetyMode === 'auto' || safetyMode === 'suggest' || safetyMode === 'hold' ? undefined : requestId
      send(wc, {
        type: 'step',
        requestId: emitRequestId,
        safetyMode,
        structured: parsed
      })

      // 让下一轮请求带上本步助手 JSON，避免模型「失忆」而在每步重复同一段 description。
      const proposalTasks = sessionState.taskGraph.map((task) => ({ ...task }))
      const proposalEpisodes = thread.episodes.length
      conversation.push({ role: 'assistant' as const, content: content.trim() })
      thread = appendEpisode(
        thread,
        summarizePlannerStep({
          step,
          action: parsed.action,
          description: parsed.description,
          command: parsed.command
        })
      )
      rememberNote(sessionState, parsed.description)
      rememberAction(sessionState, parsed.action)
      updateTaskGraphOnAction(sessionState, parsed)

      if (parsed.action === 'end') {
        thread = markWorkingStatus(thread, 'done')
        persistAll()
        send(wc, { type: 'done' })
        return
      }

      // Interrupted steps wait here. Nothing is written until resume → executing.
      // auto skips Agree and moves straight to executing. suggest / hold do not write.
      // A missing safety tier keeps the legacy confirm path, including read-only commands.
      if (needsInterrupt && safetyMode === 'auto') {
        consecutiveSnapshotTools = 0
        hitl = markHitlExecuting(resumeHitl(hitl, true))
        if (!sideEffectExecutionPermitted(hitl)) {
          send(wc, { type: 'error', message: mt('内部错误：安全档自动执行未进入执行态', 'Internal error: safety-tier auto-run did not enter executing') })
          return
        }
      } else if (needsInterrupt && skipCommandWrite) {
        consecutiveSnapshotTools = 0
        rememberNote(
          sessionState,
          safetyMode === 'hold'
            ? mt('交互命令已在执行，未再次询问同意，也未再次写入。', 'The interactive command is already running. Agree was not asked again, and it was not written again.')
            : mt('当前安全档只建议这条命令，未写入终端。', 'The safety tier only suggested this command. It was not written to the terminal.')
        )
      } else if (needsInterrupt) {
        consecutiveSnapshotTools = 0
        if (!requestId || hitl.phase !== 'interrupted') {
          send(wc, { type: 'error', message: mt('内部错误：command 缺少 requestId', "Internal error: command is missing requestId") })
          return
        }

        const decision = await waitForAiConfirm(requestId)
        if (decision === 'cancel' || runCtx.userAborted) {
          // Cancel drops the proposal and returns to planning. Deny stays cancelled.
          hitl = cancelHitl(hitl)
          releaseCancelledProposal(sessionState, parsed, { tasks: proposalTasks })
          if (thread.episodes.length > proposalEpisodes) {
            thread = { ...thread, episodes: thread.episodes.slice(0, proposalEpisodes) }
          }
          const plannable = hitlIsPlannable(hitl) && !sideEffectExecutionPermitted(hitl)
          emitDebug({
            kind: 'execution',
            round: step,
            label: 'HITL cancel',
            detail: `phase=${hitl.phase} decision=cancel plannable=${String(plannable)}`
          })
          if (!plannable) {
            send(wc, {
              type: 'error',
              message: mt('内部错误：取消后中断仍未释放', 'Internal error: the interrupt was still held after cancel')
            })
            return
          }
          send(wc, {
            type: 'cancelled',
            message: runCtx.userAborted
              ? mt('已停止生成', 'Generation stopped')
              : mt('已取消：这一步未执行，可以重新规划', 'Cancelled: this step did not run, and a new plan can start')
          })
          send(wc, { type: 'done' })
          return
        }
        hitl = resumeHitl(hitl, decision === 'approve')
        emitDebug({
          kind: 'execution',
          round: step,
          label: 'HITL resume',
          detail: `phase=${hitl.phase} decision=${hitl.resume ?? 'deny'}`
        })
        if (hitl.phase !== 'resumed') {
          emitDebug({
            kind: 'execution',
            round: step,
            label: mt('用户未同意执行命令', "User declined to run the command"),
            detail: parsed.command?.trim() ? capDebugDetail(parsed.command.trim()) : undefined
          })
          send(wc, { type: 'cancelled', message: mt('已取消：你未同意执行该命令', "Cancelled: you declined to run this command") })
          send(wc, { type: 'done' })
          return
        }
        hitl = markHitlExecuting(hitl)
        if (isInteractiveCommand(parsed.command ?? '')) inFlight.note(parsed.command ?? '')
      }

      if (parsed.action === 'tool_call') {
        const toolName = parsed.toolName?.trim()
        const toolInput = parsed.toolInput
        const invStore = getInventoryStore()

        const resolveHostId = (): string | null => {
          if (toolInput?.hostId?.trim()) return toolInput.hostId.trim()
          if (payload.hostInventoryId?.trim()) return payload.hostInventoryId.trim()
          if (payload.inventoryLookup?.profileId) {
            const hit = invStore.findByProfileId(payload.inventoryLookup.profileId)
            if (hit) return hit.meta.id
          }
          if (payload.inventoryLookup?.host) {
            const hit = invStore.findByHostPort(
              payload.inventoryLookup.host,
              payload.inventoryLookup.port ?? 22
            )
            if (hit) return hit.meta.id
          }
          return null
        }

        if (toolName === 'get_host_inventory') {
          let text: string
          if (toolInput?.query?.trim()) {
            const hits = invStore.search(toolInput.query.trim())
            text =
              hits.length === 0
                ? mt(`（搜索「${toolInput.query.trim()}」无结果）`, `(no results for "${toolInput.query.trim()}")`)
                : hits
                    .map((h) => {
                      const body = invStore.formatContext({ hostId: h.id })
                      return body || `- ${h.id} ${h.title}`
                    })
                    .join('\n---\n')
          } else {
            const hid = resolveHostId()
            text = hid
              ? invStore.formatContext({ hostId: hid }) || mt(`（档案 ${hid} 为空）`, `(profile ${hid} is empty)`)
              : mt('（未指定 hostId/query，且当前会话未关联档案。可用 query 搜索。）', "(No hostId/query given and the session has no linked profile. Use query to search.)")
          }
          lastToolResult = text
          consecutiveSnapshotTools = 0
          appendObservation(sessionState, text, 'get_host_inventory')
          emitDebug({
            kind: 'execution',
            round: step,
            label: mt('工具：get_host_inventory', "Tool: get_host_inventory"),
            detail: capDebugDetail(text)
          })
          continue
        }

        if (toolName === 'upsert_host_service') {
          const hid = resolveHostId()
          const serviceName = toolInput?.serviceName?.trim()
          if (!hid || !serviceName) {
            send(wc, {
              type: 'error',
              message: mt('upsert_host_service 需要 hostId（或当前会话已关联档案）以及 serviceName', "upsert_host_service needs hostId (or a linked profile) and serviceName")
            })
            return
          }
          const kindRaw = (toolInput?.serviceKind || 'unknown').toLowerCase()
          const kind: HostServiceKind =
            kindRaw === 'systemd' || kindRaw === 'docker' || kindRaw === 'k8s' || kindRaw === 'binary'
              ? kindRaw
              : 'unknown'
          const updated = invStore.upsertService(hid, {
            name: serviceName,
            kind,
            ports: toolInput?.servicePorts,
            notes: toolInput?.serviceNotes
          })
          const text = updated
            ? mt(`已更新档案 ${hid} 的服务 ${serviceName}。\n`, `Updated service ${serviceName} in profile ${hid}.\n`) + invStore.formatContext({ hostId: hid })
            : mt(`（无法更新：档案 ${hid} 不存在）`, `(cannot update: profile ${hid} does not exist)`)
          lastToolResult = text
          consecutiveSnapshotTools = 0
          rememberNote(sessionState, mt(`已登记服务 ${serviceName} → ${hid}`, `Registered service ${serviceName} → ${hid}`))
          emitDebug({
            kind: 'execution',
            round: step,
            label: mt('工具：upsert_host_service', "Tool: upsert_host_service"),
            detail: capDebugDetail(text)
          })
          continue
        }

        if (toolName === 'append_host_note') {
          const hid = resolveHostId()
          const note = toolInput?.note?.trim()
          if (!hid || !note) {
            send(wc, {
              type: 'error',
              message: mt('append_host_note 需要 hostId（或关联档案）以及 note', "append_host_note needs hostId (or a linked profile) and note")
            })
            return
          }
          const updated = invStore.appendNote(hid, note)
          const text = updated
            ? mt(`已追加备注到 ${hid}。\n`, `Appended note to ${hid}.\n`) + invStore.formatContext({ hostId: hid })
            : mt(`（无法追加：档案 ${hid} 不存在）`, `(cannot append: profile ${hid} does not exist)`)
          lastToolResult = text
          consecutiveSnapshotTools = 0
          rememberNote(sessionState, mt(`已写主机备注 → ${hid}`, `Wrote host note → ${hid}`))
          emitDebug({
            kind: 'execution',
            round: step,
            label: mt('工具：append_host_note', "Tool: append_host_note"),
            detail: capDebugDetail(text)
          })
          continue
        }

        if (toolName !== 'get_terminal_snapshot') {
          send(wc, { type: 'error', message: mt(`不支持的工具：${toolName ?? '(空)'}`, `Unsupported tool: ${toolName ?? '(空)'}`) })
          return
        }

        // get_terminal_snapshot is auto-executed (no user confirmation).

        let snapText: string
        if (!targetSessionId) {
          snapText = mt('（当前未关联 SSH 会话，无法读取终端快照。）', "(No SSH session linked; cannot read the terminal snapshot.)")
        } else {
          const maxLines =
            toolInput?.maxLines && Number.isFinite(toolInput.maxLines)
              ? Math.min(2000, Math.max(1, Math.floor(toolInput.maxLines)))
              : 800
          const fromCurrentCommand = toolInput?.fromCurrentCommand === true
          const includeCommandLine = toolInput?.includeCommandLine !== false

          logAi('tool:get_terminal_snapshot exec', { maxLines, fromCurrentCommand, includeCommandLine, targetSessionId })

          const captured = await captureTerminalSnapshot(ssh, targetSessionId, fromCurrentCommand)
          snapText =
            captured == null || !captured.trim() ?
              mt('（该会话暂无缓冲输出或会话已断开。）', "(No buffered output for this session, or it has disconnected.)")
            : captured
        }

        if (prevSnapFingerprint != null && snapText === prevSnapFingerprint) {
          sameSnapshotRepeat++
        } else {
          sameSnapshotRepeat = 0
        }
        prevSnapFingerprint = snapText

        const previousCommand = lastCommand
        lastToolResult = snapText
        lastCommand = null
        lastWriteOk = null
        consecutiveSnapshotTools++
        const toolScore = scoreToolSnapshot(snapText, previousCommand)
        sessionState.lastToolScore = toolScore
        if (toolScore.score < 0.5) {
          sessionState.failureStreak += 1
          rememberNote(sessionState, mt(`工具结果质量偏低：${toolScore.reason}`, `Tool result quality is low: ${toolScore.reason}`))
        } else {
          sessionState.failureStreak = 0
        }
        appendObservation(sessionState, snapText, previousCommand)

        emitDebug({
          kind: 'execution',
          round: step,
          label: mt('工具：get_terminal_snapshot', "Tool: get_terminal_snapshot"),
          detail: capDebugDetail(
            `maxLines=${toolInput?.maxLines && Number.isFinite(toolInput.maxLines) ? Math.min(2000, Math.max(1, Math.floor(toolInput.maxLines))) : 800}\nfromCurrentCommand=${String(toolInput?.fromCurrentCommand === true)}\nincludeCommandLine=${String(toolInput?.includeCommandLine !== false)}\n---\n${snapText}`
          )
        })
        emitDebug({
          kind: 'execution',
          round: step,
          label: mt('工具结果评分', "Tool result score"),
          detail: `score=${Math.round(toolScore.score * 100)} level=${toolScore.level}\n${toolScore.reason}`
        })

        if (sameSnapshotRepeat >= MAX_SAME_SNAPSHOT_REPEAT || consecutiveSnapshotTools >= MAX_CONSECUTIVE_SNAPSHOT_TOOLS) {
          send(wc, {
            type: 'step',
            structured: {
              description:
                mt('已自动结束：模型多次读取终端快照但未带来新信息（内容重复或步数过多）。请直接描述你的目标，或勾选「附带最近终端输出」后重新提问。', "Ended automatically: the model read the terminal snapshot repeatedly without new information (duplicate content or too many steps). Describe your goal directly, or tick \"Attach recent terminal output\" and ask again."),
              action: 'end',
              completed: true,
              riskLevel: 'low',
              notes: mt('若需继续排查，可把关键命令输出粘贴到问题里，或手动执行只读命令（如 journalctl -b、systemctl status）后再问。', "To keep troubleshooting, paste key command output into your question, or run a read-only command (e.g. journalctl -b, systemctl status) yourself and ask again.")
            }
          })
          send(wc, { type: 'done' })
          return
        }
      } else if (parsed.action === 'command' && skipCommandWrite) {
        emitDebug({
          kind: 'execution',
          round: step,
          label: safetyMode === 'hold' ? 'safety hold' : 'safety suggest',
          detail: `write=false mode=${safetyMode ?? ''}\n${(parsed.command ?? '').trim()}`
        })
      } else if (parsed.action === 'command') {
        // Write only after interrupt → approve → executing, or a safety-tier auto decision.
        // Bypass via autoApproveLowRisk is fail-closed. High risk is not auto.
        if (!sideEffectExecutionPermitted(hitl) || confirmBypassAllowed(settings.autoApproveLowRisk)) {
          send(wc, {
            type: 'error',
            message: mt('命令仍在确认中，未写入终端。', 'Command is still awaiting confirmation and was not written to the terminal.')
          })
          return
        }
        const cmdRaw = parsed.command ?? ''
        const oneLineCmd = cmdRaw.replace(/[\r\n]+/g, ' ').trim()
        if (!oneLineCmd) {
          send(wc, { type: 'error', message: mt('模型返回了空 command', "The model returned an empty command") })
          return
        }

        if (!targetSessionId) {
          send(wc, { type: 'error', message: mt('当前未关联 SSH 会话，无法执行命令。', "No SSH session linked; cannot run commands.") })
          return
        }

        if (requestId && writtenRequestIds.has(requestId)) {
          send(wc, {
            type: 'error',
            message: mt('同一确认不会再次写入终端。', 'The same confirmation does not write to the terminal again.')
          })
          return
        }
        const writeBudget =
          lastFailure && lastFailure.command === oneLineCmd
            ? observeRetryBudget(lastFailure.count, lastFailure.command)
            : null
        if (
          !retryWritePermitted({
            command: oneLineCmd,
            failedCommand: lastFailure?.command ?? null,
            requestId: requestId ?? null,
            priorRequestId: lastFailure?.requestId ?? null,
            approved: true,
            failureCount: lastFailure && lastFailure.command === oneLineCmd ? lastFailure.count : 0
          })
        ) {
          if (writeBudget?.exhausted && lastFailure) {
            send(wc, {
              type: 'step',
              structured: {
                description: explainRetryBudgetStop(lastFailure, writeBudget),
                action: 'end',
                completed: true,
                riskLevel: 'low',
                notes: mt('同一失败路径已超过重试预算，未再写入。', 'The retry budget for this failed command is spent, so it was not written again.')
              }
            })
            send(wc, { type: 'done' })
            return
          }
          send(wc, {
            type: 'error',
            message: mt('失败的命令不会自动重跑。若要再执行，需要新的确认。', 'A failed command does not run again on its own. Another run needs a new confirmation.')
          })
          return
        }
        if (requestId) writtenRequestIds.add(requestId)

        logAi('ssh:write exec', { targetSessionId, cmd: trimForLog(oneLineCmd, 200) })
        lastWriteOk = ssh.write(targetSessionId, `${oneLineCmd}\n`)
        lastCommand = oneLineCmd
        lastToolResult = null
        rememberCommand(sessionState, oneLineCmd)
        if (!lastWriteOk) {
          sessionState.failureStreak += 1
          rememberNote(sessionState, mt(`命令发送失败：${oneLineCmd}`, `Failed to send command: ${oneLineCmd}`))
        }
        hitl = markHitlObserving(hitl)
        emitDebug({
          kind: 'execution',
          round: step,
          label: mt('命令已发送到 SSH（含换行）', "Command sent to SSH (with newline)"),
          detail: `phase=${hitl.phase}\nwriteOk=${String(lastWriteOk)}\n${oneLineCmd}`
        })

        if (lastWriteOk && targetSessionId) {
          await new Promise<void>((r) => setTimeout(r, settleMsAfterCommand()))
          const postCmdSnap = await captureTerminalSnapshot(ssh, targetSessionId, true)
          if (postCmdSnap?.trim()) {
            lastToolResult = postCmdSnap
            lastCommand = oneLineCmd
            sessionState.lastToolScore = scoreToolSnapshot(postCmdSnap, oneLineCmd)
            appendObservation(sessionState, postCmdSnap, oneLineCmd)
            if (sessionState.lastToolScore.score >= 0.5) sessionState.failureStreak = 0
            rememberNote(sessionState, mt('命令执行后已自动观测终端输出', "Terminal output observed automatically after the command"))
            emitDebug({
              kind: 'execution',
              round: step,
              label: mt('Observe：命令后自动快照', "Observe: automatic snapshot after command"),
              detail: capDebugDetail(postCmdSnap)
            })
          }
        }

        const reported = readConfirmedCommandOutcome(ssh, targetSessionId, oneLineCmd)
        const failure =
          reported || lastWriteOk === false
            ? classifyCommandFailure(oneLineCmd, {
                exitCode: reported?.exitCode,
                stderr: reported?.stderr,
                timedOut: reported?.timedOut,
                timeoutMark: reported?.timeoutMark,
                writeOk: lastWriteOk === true
              })
            : null
        if (failure && requestId) {
          if (lastWriteOk) sessionState.failureStreak += 1
          const nextCount: number = lastFailure && lastFailure.command === failure.command ? lastFailure.count + 1 : 1
          lastFailure = { ...failure, requestId, count: nextCount }
          const failedBudget = observeRetryBudget(nextCount, failure.command)
          lastToolResult = lastToolResult?.trim() ? `${lastToolResult.trim()}\n${failure.evidence}` : failure.evidence
          rememberNote(sessionState, failure.evidence)
          emitDebug({
            kind: 'execution',
            round: step,
            label: mt('命令失败', 'Command failed'),
            detail: `failed=true kind=${failure.kind} autoRetry=false retryBudget count=${failedBudget.count} cap=${failedBudget.cap} exhausted=${String(failedBudget.exhausted)} nearBudget=${String(failedBudget.nearBudget)}\n${failure.evidence}`
          })
        } else if (lastWriteOk && lastFailure && lastFailure.command === oneLineCmd) {
          lastFailure = null
        }
      }

      persistAll()
      await new Promise<void>((resolve) => setTimeout(resolve, pollWaitMs))
    }

    send(wc, {
      type: 'step',
      structured: {
        description: mt(`已轮询 ${maxSteps} 次仍未结束。建议你查看终端输出并提出更明确的下一步目标。`, `Still not finished after ${maxSteps} polls. Check the terminal output and give a clearer next goal.`),
        action: 'end',
        completed: true,
        riskLevel: 'low',
        notes: mt('若需要继续排错，请再次向 AI 提问，并勾选/附带最新终端输出。', "To keep troubleshooting, ask the AI again and attach the latest terminal output.")
      }
    })
    send(wc, { type: 'done' })
  } catch (e) {
    if (isAbortError(e) || runCtx.userAborted) {
      send(wc, { type: 'cancelled', message: mt('已停止生成', "Generation stopped") })
      send(wc, { type: 'done' })
      return
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai] core-a failed:', msg)
    logAi('ai:interactive error', msg)
    send(wc, { type: 'error', message: msg })
    send(wc, { type: 'done' })
  } finally {
    try {
      persistAll()
    } catch {
      /* persistence must not hide the original chat error */
    }
    if (activeAiChat?.ac === ac) activeAiChat = null
  }
}

// Backward-compatible alias for older import sites.
export const runLangGraphAgentChat = runOpenClawCoreAgentChat

