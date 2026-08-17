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
import { loadPersistedCoreSession, savePersistedCoreSession } from './core-a-memory'
import { getInventoryStore } from './inventory-store'
import type { HostServiceKind } from '../shared/inventory'

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
      return c.length > 800 ? `${c.slice(0, 800)}…` : c || '(空)'
    }
  }
  return '(无用户消息)'
}

function cloneChatMessages(m: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
  return JSON.parse(JSON.stringify(m)) as Array<{ role: string; content: string }>
}

function capDebugDetail(s: string, max = 12000): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}\n…(已截断，共 ${s.length} 字符)`
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}...`
}

const confirmWaiters = new Map<string, { resolve: (ok: boolean) => void; timer: NodeJS.Timeout }>()

type ActiveAiChat = { ac: AbortController; ctx: { userAborted: boolean } }
let activeAiChat: ActiveAiChat | null = null

/** 停止当前一轮 AI 助手（中断模型请求、解除等待中的命令确认） */
export function abortAiChat(): void {
  const cur = activeAiChat
  if (!cur) return
  cur.ctx.userAborted = true
  cur.ac.abort()
  for (const [, rec] of [...confirmWaiters.entries()]) {
    clearTimeout(rec.timer)
    rec.resolve(false)
  }
  confirmWaiters.clear()
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
  const rec = confirmWaiters.get(requestId)
  if (!rec) return false
  confirmWaiters.delete(requestId)
  clearTimeout(rec.timer)
  rec.resolve(ok)
  return true
}

async function waitForAiConfirm(requestId: string): Promise<boolean> {
  const timeout = confirmTimeoutMs()
  return await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      confirmWaiters.delete(requestId)
      resolve(false)
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

function getSessionState(targetSessionId?: string): CoreSessionState {
  const key = targetSessionId?.trim() || 'global'
  const existing = coreStateBySession.get(key)
  if (existing) return existing

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
          title: m[2]!.trim().slice(0, 120) || '历史任务',
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
  savePersistedCoreSession(targetSessionId?.trim() || 'global', {
    notes: state.notes,
    recentCommands: state.recentCommands,
    observations: state.observations,
    taskGraph: state.taskGraph.map((t) => ({ title: t.title, status: t.status }))
  })
}

function lastUserQuestion(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return messages[i].content?.trim() ?? ''
  }
  return ''
}

type PlannerTurn = { role: 'user' | 'assistant' | 'system'; content: string }

function compactConversation(conv: PlannerTurn[], maxTurns = 8): PlannerTurn[] {
  const maxMessages = maxTurns * 2
  if (conv.length <= maxMessages) return conv
  return conv.slice(-maxMessages)
}

function appendObservation(state: CoreSessionState, snapshot: string, command?: string | null): void {
  const raw = snapshot.trim()
  if (!raw || raw.includes('暂无缓冲') || raw.includes('无法读取')) return
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const tail = lines.slice(-4).join(' | ')
  const head = command ? `cmd=${command}: ` : ''
  const obs = truncate(`${head}${tail}`, 240)
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

function summarizeTaskGraph(state: CoreSessionState): string {
  if (state.taskGraph.length === 0) return '（暂无）'
  return state.taskGraph
    .slice(-6)
    .map((t) => `- [${t.status}] ${t.title} (置信度 ${Math.round(t.confidence * 100)}%)`)
    .join('\n')
}

function ensureSeedTask(state: CoreSessionState, userQuestion: string): void {
  if (state.taskGraph.length > 0) return
  const title = truncate(userQuestion || '解决用户当前问题', 120)
  state.taskGraph.push({
    id: `T${state.nextTaskId++}`,
    title: title || '解决用户当前问题',
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
  if (!raw || raw.includes('暂无缓冲输出') || raw.includes('无法读取终端快照')) {
    return { score: 0.15, level: 'high', reason: '快照为空或会话不可用' }
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

  if (score >= 0.75) return { score, level: 'low', reason: '快照信息充分，可继续决策' }
  if (score >= 0.5) return { score, level: 'medium', reason: '快照信息一般，建议补充证据' }
  return { score, level: 'high', reason: '快照信息不足，可能需要替代策略' }
}

const assistantStepSchema = z
  .object({
    description: z.string().describe('结论、步骤或原因；当 action 为 tool_call/command 时说明为何需要以及风险等级'),
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
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['toolName'], message: 'tool_call 必须给出 toolName' })
      }
    }
    if (v.action === 'command') {
      if (!v.command || !v.command.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['command'], message: 'command 必须给出 command' })
      }
    }
    if (v.action === 'end') {
      if (v.command && v.command.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['command'], message: 'end 不应给出 command' })
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
    if (action === 'command' && command) description = `建议执行命令：${command}`
    else if (action === 'tool_call') description = '需要读取终端快照以获取最新证据'
    else if (notes) description = notes
    else description = '根据当前上下文继续分析'
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
    return `模型 JSON 字段不符合约定：${lines.join('；')}`
  }
  return e instanceof Error ? e.message : String(e)
}

/** 供脚本自测；生产路径见 runOpenClawCoreAgentChat */
export function parseAssistantStep(content: string): { structured: AiAssistantReply | null; parseError?: string } {
  const jsonText = extractJsonObject(content)
  try {
    const raw = JSON.parse(jsonText) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { structured: null, parseError: '模型返回的不是 JSON 对象' }
    }
    const normalized = normalizeAssistantStepRaw(raw as Record<string, unknown>)
    const parsed = assistantStepSchema.parse(normalized) as unknown as AiAssistantReply
    const completed = typeof parsed.completed === 'boolean' ? parsed.completed : parsed.action === 'end'
    return { structured: { ...parsed, completed }, parseError: undefined }
  } catch (e) {
    const loose = parseAiAssistantReply(content)
    if (loose) {
      return { structured: loose, parseError: `严格校验失败，已宽松恢复：${formatParseError(e)}` }
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
  }
): string {
  const memorySection = state.notes.length > 0 ? state.notes.map((n, i) => `${i + 1}. ${n}`).join('\n') : '（暂无）'
  const recentCmdSection = state.recentCommands.length > 0 ? state.recentCommands.map((c) => `- ${c}`).join('\n') : '（暂无）'
  const obsSection =
    state.observations.length > 0 ? state.observations.map((o, i) => `${i + 1}. ${o}`).join('\n') : '（暂无）'
  const taskGraphSection = summarizeTaskGraph(state)
  const lastScoreSection = state.lastToolScore
    ? `${Math.round(state.lastToolScore.score * 100)} 分 / 风险 ${state.lastToolScore.level} / ${state.lastToolScore.reason}`
    : '（暂无）'

  const parts: string[] = [
    buildBootstrapPrompt(ctx.userQuestion),
    '---',
    '你必须输出单个 JSON 对象；禁止 Markdown、代码围栏以及 JSON 外文字。',
    'action（必填）：tool_call | command | end。',
    'command 需要用户确认后才执行（低风险可自动批准）；tool_call 会被系统立即执行。',
    '可用 toolName：get_terminal_snapshot | get_host_inventory | upsert_host_service | append_host_note。',
    '若上一轮刚执行过命令，系统可能已自动附带终端观测结果，请优先阅读后再决策。',
    `当前轮次：${ctx.step}`,
    '工作区观测笔记（跨轮持久）：',
    obsSection,
    '最近核心记忆：',
    memorySection,
    '最近已执行命令：',
    recentCmdSection,
    '任务图（Task Graph）：',
    taskGraphSection,
    '最近工具结果评分：',
    lastScoreSection,
    `当前失败连续计数：${state.failureStreak}`,
    'JSON 字段（description 与 action 必填）：description, action, completed, toolName, toolInput, command, riskLevel, notes。'
  ]

  if (ctx.plannerHint) {
    parts.push(`本轮策略提示：${ctx.plannerHint}`)
  }

  if (payload.targetSessionId) {
    parts.push(`当前关联 SSH 会话：${payload.targetSessionId}。`)
  } else {
    parts.push('当前未关联 SSH 会话：禁止 get_terminal_snapshot；仍可读写主机知识库或给出本地自检建议，或直接 end。')
  }

  const inv = getInventoryStore()
  const hostCtx = inv.formatContext({
    hostId: payload.hostInventoryId,
    host: payload.inventoryLookup?.host,
    port: payload.inventoryLookup?.port,
    profileId: payload.inventoryLookup?.profileId
  })
  if (hostCtx) {
    parts.push('当前主机知识库档案（本地 Inventory，可信运维事实）：\n' + hostCtx)
  } else {
    parts.push(
      '当前未命中主机知识库档案。若用户描述的是某台已知机器，可用 get_host_inventory 搜索；发现服务后可用 upsert_host_service / append_host_note 登记。'
    )
  }

  if (payload.terminalExcerpt?.trim()) {
    parts.push('用户附带终端片段：\n```\n' + payload.terminalExcerpt.trim() + '\n```')
  }

  if (ctx.lastToolResult != null) {
    parts.push('最近一次终端快照：\n```\n' + (ctx.lastToolResult.trim() ? ctx.lastToolResult.trim() : '（空）') + '\n```')
  }

  if (ctx.lastCommand) {
    parts.push(`上一条命令已发送（writeOk=${ctx.lastWriteOk === true ? 'true' : 'false'}）：\n\`\`\`\n${ctx.lastCommand}\n\`\`\``)
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
    if (!content || typeof content !== 'string') throw new Error('模型未返回有效 content')
    return content
  } catch (e) {
    if (isAbortError(e)) {
      if (userAbortSignal?.aborted) throw e
      throw new Error(`请求超时（${timeoutMs}ms）`)
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
    send(wc, { type: 'error', message: '未找到有效的 AI Provider 配置' })
    return
  }

  const apiKey = provider.apiKey.trim()
  if (!apiKey) {
    send(wc, {
      type: 'error',
      message: '请先填写 API Key（OpenClaw 风格核心会直接使用当前 Provider）。'
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
  const sessionState = getSessionState(payload.targetSessionId)
  ensureSeedTask(sessionState, userQuestion || lastUserQuestionForDebug(payload.messages))
  logAi('ai:engine core-a', { session: payload.targetSessionId ?? 'global' })
  const debugTurnId = payload.debugTurnId?.trim() ?? ''
  const debugUserQuestion = lastUserQuestionForDebug(payload.messages)
  const emitDebug = (entry: AiDebugEntry): void => {
    if (!debugTurnId) return
    send(wc, { type: 'debug', payload: { debugTurnId, userQuestion: debugUserQuestion, entry } })
  }

  let lastToolResult: string | null = null
  let lastCommand: string | null = null
  let lastWriteOk: boolean | null = null

  const MAX_TOOL_RESULT_CHARS = 6000

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

  if (targetSessionId && !payload.terminalExcerpt?.trim()) {
    const bootSnap = await captureTerminalSnapshot(ssh, targetSessionId, true)
    if (bootSnap) {
      lastToolResult = bootSnap
      sessionState.lastToolScore = scoreToolSnapshot(bootSnap, null)
      appendObservation(sessionState, bootSnap, null)
      rememberNote(sessionState, '会话启动时已自动读取终端上下文')
    }
  }

  try {
    for (let step = 1; step <= maxSteps; step++) {
      conversation = compactConversation(conversation)
      if (runCtx.userAborted) {
        send(wc, { type: 'cancelled', message: '已停止生成' })
        send(wc, { type: 'done' })
        return
      }

      send(wc, { type: 'status', text: `正在生成第 ${step} 步...` })
      if (sessionState.failureStreak >= 2) {
        rememberNote(sessionState, '检测到连续失败，下一步应优先选择低风险证据命令或直接结束并说明缺失信息。')
      }

      let plannerHint: string | null = null
      if (!lastToolResult && targetSessionId && step <= 2) {
        plannerHint = '尚无终端证据，本轮应优先 tool_call(get_terminal_snapshot)，不要直接 command。'
      } else if (lastCommand && lastToolResult) {
        plannerHint = '上一条命令已执行且已有自动观测，请基于快照给出结论或下一步；证据充分时请 end。'
      } else if (sessionState.failureStreak >= 2) {
        plannerHint = '连续失败：优先只读快照或低风险 command，避免重复相同动作。'
      }

      const sysPrompt = buildCoreSystemPrompt(payload, sessionState, {
        step,
        userQuestion,
        lastToolResult: lastToolResult ? lastToolResult.slice(0, MAX_TOOL_RESULT_CHARS) : null,
        lastCommand,
        lastWriteOk,
        plannerHint
      })

      const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: 'json' },
        { role: 'system', content: sysPrompt },
        ...conversation
      ]

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
        throw new Error(parseError ?? '模型返回 JSON 解析失败')
      }

      let parsed = structured
      const actionFingerprint = `${parsed.action}|${parsed.toolName ?? ''}|${(parsed.command ?? '').replace(/\s+/g, ' ').trim()}`
      if (sessionState.lastActionFingerprint === actionFingerprint) {
        sessionState.repeatActionCount += 1
      } else {
        sessionState.repeatActionCount = 0
      }
      sessionState.lastActionFingerprint = actionFingerprint
      if (sessionState.repeatActionCount >= 2) {
        parsed = {
          description: '检测到动作重复且没有新证据，已自动结束以避免无效循环。请补充关键终端输出后再继续。',
          action: 'end',
          completed: true,
          riskLevel: 'low',
          notes: '建议附带相关报错或执行结果，再发起下一轮。'
        }
      }

      if (
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
          rememberNote(sessionState, '结束前轮询：证据不足，已自动补充终端观测')
          send(wc, { type: 'status', text: '证据不足，已自动读取终端后继续分析…' })
          persistSessionState(targetSessionId, sessionState)
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

      // Only `command` steps require user confirmation (unless low-risk auto-approve).
      const autoApproveLowRiskCommand =
        parsed.action === 'command' &&
        settings.autoApproveLowRisk === true &&
        String(parsed.riskLevel ?? '').toLowerCase() === 'low'

      const requestId =
        parsed.action === 'command' && !autoApproveLowRiskCommand ? randomUUID() : undefined

      send(wc, {
        type: 'step',
        requestId,
        autoApproved: autoApproveLowRiskCommand ? true : undefined,
        structured: parsed
      })

      // 让下一轮请求带上本步助手 JSON，避免模型「失忆」而在每步重复同一段 description。
      conversation.push({ role: 'assistant' as const, content: content.trim() })
      rememberNote(sessionState, parsed.description)
      rememberAction(sessionState, parsed.action)
      updateTaskGraphOnAction(sessionState, parsed)

      if (parsed.action === 'end') {
        persistSessionState(targetSessionId, sessionState)
        send(wc, { type: 'done' })
        return
      }

      // For command steps, wait for user confirmation before executing (skip when auto-approved).
      if (parsed.action === 'command') {
        consecutiveSnapshotTools = 0
        if (autoApproveLowRiskCommand) {
          emitDebug({
            kind: 'execution',
            round: step,
            label: '低风险命令已自动批准',
            detail: parsed.command?.trim() ? capDebugDetail(parsed.command.trim()) : undefined
          })
        } else {
          if (!requestId) {
            send(wc, { type: 'error', message: '内部错误：command 缺少 requestId' })
            return
          }

          const ok = await waitForAiConfirm(requestId)
          if (runCtx.userAborted) {
            send(wc, { type: 'cancelled', message: '已停止生成' })
            send(wc, { type: 'done' })
            return
          }
          if (!ok) {
            emitDebug({
              kind: 'execution',
              round: step,
              label: '用户未同意执行命令',
              detail: parsed.command?.trim() ? capDebugDetail(parsed.command.trim()) : undefined
            })
            send(wc, { type: 'cancelled', message: '已取消：你未同意执行该命令' })
            return
          }
        }
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
                ? `（搜索「${toolInput.query.trim()}」无结果）`
                : hits
                    .map((h) => {
                      const body = invStore.formatContext({ hostId: h.id })
                      return body || `- ${h.id} ${h.title}`
                    })
                    .join('\n---\n')
          } else {
            const hid = resolveHostId()
            text = hid
              ? invStore.formatContext({ hostId: hid }) || `（档案 ${hid} 为空）`
              : '（未指定 hostId/query，且当前会话未关联档案。可用 query 搜索。）'
          }
          lastToolResult = text
          consecutiveSnapshotTools = 0
          appendObservation(sessionState, text, 'get_host_inventory')
          emitDebug({
            kind: 'execution',
            round: step,
            label: '工具：get_host_inventory',
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
              message: 'upsert_host_service 需要 hostId（或当前会话已关联档案）以及 serviceName'
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
            ? `已更新档案 ${hid} 的服务 ${serviceName}。\n` + invStore.formatContext({ hostId: hid })
            : `（无法更新：档案 ${hid} 不存在）`
          lastToolResult = text
          consecutiveSnapshotTools = 0
          rememberNote(sessionState, `已登记服务 ${serviceName} → ${hid}`)
          emitDebug({
            kind: 'execution',
            round: step,
            label: '工具：upsert_host_service',
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
              message: 'append_host_note 需要 hostId（或关联档案）以及 note'
            })
            return
          }
          const updated = invStore.appendNote(hid, note)
          const text = updated
            ? `已追加备注到 ${hid}。\n` + invStore.formatContext({ hostId: hid })
            : `（无法追加：档案 ${hid} 不存在）`
          lastToolResult = text
          consecutiveSnapshotTools = 0
          rememberNote(sessionState, `已写主机备注 → ${hid}`)
          emitDebug({
            kind: 'execution',
            round: step,
            label: '工具：append_host_note',
            detail: capDebugDetail(text)
          })
          continue
        }

        if (toolName !== 'get_terminal_snapshot') {
          send(wc, { type: 'error', message: `不支持的工具：${toolName ?? '(空)'}` })
          return
        }

        // get_terminal_snapshot is auto-executed (no user confirmation).

        let snapText: string
        if (!targetSessionId) {
          snapText = '（当前未关联 SSH 会话，无法读取终端快照。）'
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
              '（该会话暂无缓冲输出或会话已断开。）'
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
          rememberNote(sessionState, `工具结果质量偏低：${toolScore.reason}`)
        } else {
          sessionState.failureStreak = 0
        }
        appendObservation(sessionState, snapText, previousCommand)

        emitDebug({
          kind: 'execution',
          round: step,
          label: '工具：get_terminal_snapshot',
          detail: capDebugDetail(
            `maxLines=${toolInput?.maxLines && Number.isFinite(toolInput.maxLines) ? Math.min(2000, Math.max(1, Math.floor(toolInput.maxLines))) : 800}\nfromCurrentCommand=${String(toolInput?.fromCurrentCommand === true)}\nincludeCommandLine=${String(toolInput?.includeCommandLine !== false)}\n---\n${snapText}`
          )
        })
        emitDebug({
          kind: 'execution',
          round: step,
          label: '工具结果评分',
          detail: `score=${Math.round(toolScore.score * 100)} level=${toolScore.level}\n${toolScore.reason}`
        })

        if (sameSnapshotRepeat >= MAX_SAME_SNAPSHOT_REPEAT || consecutiveSnapshotTools >= MAX_CONSECUTIVE_SNAPSHOT_TOOLS) {
          send(wc, {
            type: 'step',
            structured: {
              description:
                '已自动结束：模型多次读取终端快照但未带来新信息（内容重复或步数过多）。请直接描述你的目标，或勾选「附带最近终端输出」后重新提问。',
              action: 'end',
              completed: true,
              riskLevel: 'low',
              notes: '若需继续排查，可把关键命令输出粘贴到问题里，或手动执行只读命令（如 journalctl -b、systemctl status）后再问。'
            }
          })
          send(wc, { type: 'done' })
          return
        }
      } else if (parsed.action === 'command') {
        // command requires user confirmation (handled below).
        const cmdRaw = parsed.command ?? ''
        const oneLineCmd = cmdRaw.replace(/[\r\n]+/g, ' ').trim()
        if (!oneLineCmd) {
          send(wc, { type: 'error', message: '模型返回了空 command' })
          return
        }

        if (!targetSessionId) {
          send(wc, { type: 'error', message: '当前未关联 SSH 会话，无法执行命令。' })
          return
        }

        logAi('ssh:write exec', { targetSessionId, cmd: trimForLog(oneLineCmd, 200) })
        lastWriteOk = ssh.write(targetSessionId, `${oneLineCmd}\n`)
        lastCommand = oneLineCmd
        lastToolResult = null
        rememberCommand(sessionState, oneLineCmd)
        if (!lastWriteOk) {
          sessionState.failureStreak += 1
          rememberNote(sessionState, `命令发送失败：${oneLineCmd}`)
        }
        emitDebug({
          kind: 'execution',
          round: step,
          label: '命令已发送到 SSH（含换行）',
          detail: `writeOk=${String(lastWriteOk)}\n${oneLineCmd}`
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
            rememberNote(sessionState, '命令执行后已自动观测终端输出')
            emitDebug({
              kind: 'execution',
              round: step,
              label: 'Observe：命令后自动快照',
              detail: capDebugDetail(postCmdSnap)
            })
          }
        }
      }

      persistSessionState(targetSessionId, sessionState)
      await new Promise<void>((resolve) => setTimeout(resolve, pollWaitMs))
    }

    send(wc, {
      type: 'step',
      structured: {
        description: `已轮询 ${maxSteps} 次仍未结束。建议你查看终端输出并提出更明确的下一步目标。`,
        action: 'end',
        completed: true,
        riskLevel: 'low',
        notes: '若需要继续排错，请再次向 AI 提问，并勾选/附带最新终端输出。'
      }
    })
    send(wc, { type: 'done' })
  } catch (e) {
    if (isAbortError(e) || runCtx.userAborted) {
      send(wc, { type: 'cancelled', message: '已停止生成' })
      send(wc, { type: 'done' })
      return
    }
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ai] core-a failed:', msg)
    logAi('ai:interactive error', msg)
    send(wc, { type: 'error', message: msg })
    send(wc, { type: 'done' })
  } finally {
    if (activeAiChat?.ac === ac) activeAiChat = null
  }
}

// Backward-compatible alias for older import sites.
export const runLangGraphAgentChat = runOpenClawCoreAgentChat

