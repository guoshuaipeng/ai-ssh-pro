import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AiAssistantReply, AiChatPayload, AiSettings, AiStreamEvent } from '../shared/ipc'
import type { SshSessionManager } from './ssh-manager'
import { streamOpenAICompatibleChat } from './ai-stream'

function send(wc: WebContents, ev: AiStreamEvent): void {
  if (!wc.isDestroyed()) wc.send('ai:stream', ev)
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

function redactTerminalExcerptFromSystemPrompt(systemPrompt: string): string {
  if (process.env.AISS_LOG_AI_PROMPT_FULL === '1') return systemPrompt

  const redactedBlock = '\n```\n[REDACTED terminal excerpt]\n```'

  const re1 = /用户提供的终端片段[\s\S]*?\n```\n[\s\S]*?\n```/m
  const re2 = /用户随消息附带的终端片段[\s\S]*?\n```\n[\s\S]*?\n```/m

  return systemPrompt
    .replace(re1, (m) => m.split('\n```')[0].trimEnd() + redactedBlock)
    .replace(re2, (m) => m.split('\n```')[0].trimEnd() + redactedBlock)
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

const assistantStepSchema = z
  .object({
    description: z.string().describe('结论、步骤或原因；当 action 为 tool_call/command 时说明为何需要以及风险等级'),
    action: z.enum(['tool_call', 'command', 'end']).describe('下一步动作：tool_call/command/end'),
    completed: z.boolean().optional().describe('任务是否已完成；若 action=end 通常为 true'),
    toolName: z.string().optional().describe('当 action=tool_call 时：工具名（仅允许 get_terminal_snapshot）'),
    toolInput: z
      .object({
        maxLines: z.number().int().min(1).max(500).optional().describe('最多读取行数，建议 50-300')
      })
      .optional()
      .describe('当 action=tool_call 时：工具输入'),
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

function buildSystemPrompt(
  payload: AiChatPayload,
  ctx: { lastToolResult?: string | null; lastCommand?: string | null; lastWriteOk?: boolean | null }
): string {
  const parts: string[] = [
    '你是运维/开发助手，结合用户问题与终端上下文给出下一步（工具请求或命令），并用 JSON 返回给主进程。',
    '强约束（必须遵守）：你只能输出一个单独的 JSON 对象（不要 Markdown、不要代码围栏、不要输出 JSON 以外的文字）。',
    '强约束（动作显式）：你的 JSON 必须包含 action（tool_call / command / end）。',
    '强约束（确认机制）：当 action=command 时，本应用会先把这一步展示给用户并等待用户同意后，才会真正执行命令；当 action=tool_call 且 toolName=get_terminal_snapshot 时，本应用会立即调用工具并继续下一步（不需要用户同意）。因此你必须在 description/note 里解释你的目标与预期结果。',
    '可用工具：get_terminal_snapshot（读取当前关联 SSH 会话终端 ring buffer 最近若干行）。当需要最新证据时必须先 tool_call get_terminal_snapshot。',
    '命令策略（强约束）：action=command 时必须给出 command，且 command 必须是单行、禁止换行；当风险较高或不确定时用 riskLevel=high 并在 notes 里强调为什么要确认。',
    '上下文策略：不要虚构终端输出；若工具返回为空，你必须在 description 里说明并改用通用排查步骤。',
    '防重复（强约束）：系统消息里若已包含「最近一次 get_terminal_snapshot 返回」且与上一轮相比没有新的有效信息，禁止再次 action=tool_call 读取快照；必须改为 action=command（给出具体单行排查命令）或 action=end。',
    '何时必须终止 action=end（强约束）：满足任一条时本回合只能 end，且 completed=true，禁止再发 command 或 tool_call：',
    '  (1) 用户问题已被「用户随消息附带的终端片段」或「最近一次 get_terminal_snapshot 返回」直接满足（例如已能看到目录列表、ls 结果、报错行、提示符与当前路径）。',
    '  (2) 你拟给出的 command 与「上一条已由应用发送的命令」实质相同或仅换说法（如再次 ls -la、再次 “列出目录”），而终端里已有对应输出或无需再执行一遍：必须 end，在 description 里用一两句话总结已看到的要点与后续可选操作，不要让用户再点一次同意。',
    '  (3) 当前信息已足够给出结论或排查方向，没有新的、非重复的单行命令值得代用户执行时。',
    '  (4) 确实缺信息且多一次快照也不会更好：end，在 description 说明缺什么、请用户粘贴哪段输出或说明目标。',
    '一轮一问原则：每个用户问题默认尽量少步结束；能一次快照或已有片段里回答就不要再链式重复读终端或重复同类命令。',
    'JSON 字段约定（强约束）：description, action, completed(可选), toolName(仅 action=tool_call 时建议给出), toolInput(仅 action=tool_call 时建议给出 maxLines), command(仅 action=command 时), riskLevel, notes(可选)。'
  ]

  if (payload.targetSessionId) {
    parts.push(`当前关联的 SSH 会话 ID：${payload.targetSessionId}（仅作上下文，不是秘密）。`)
  } else {
    parts.push('当前未关联 SSH 会话：禁止请求 tool_call（get_terminal_snapshot）；只能给出 action=command 的安全自检命令让用户手动确认后再继续。')
  }

  if (payload.terminalExcerpt?.trim()) {
    parts.push('用户随消息附带的终端片段（可能含敏感信息）：\n```\n' + payload.terminalExcerpt.trim() + '\n```')
  }

  if (ctx.lastToolResult != null) {
    parts.push('最近一次 get_terminal_snapshot 返回（用于判断下一步）：\n```\n' + (ctx.lastToolResult.trim() ? ctx.lastToolResult.trim() : '（空）') + '\n```')
  }

  if (ctx.lastCommand) {
    parts.push(
      `上一条命令已由应用发送到远端（writeOk=${ctx.lastWriteOk === true ? 'true' : 'false'}，是否成功需结合 get_terminal_snapshot 判断）：\n\`\`\`\n${ctx.lastCommand}\n\`\`\``
    )
    parts.push(
      '若最近一次快照里已包含该命令的输出，或用户需求仅为「看目录/列文件」且输出已在快照中：你必须 action=end，不得再建议同义命令（例如再次 ls -la）。'
    )
  }

  return parts.join('\n')
}

async function callModelJson(params: {
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

export async function runLangGraphAgentChat(
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
    send(wc, { type: 'error', message: '请先在设置中填写 API Key（主进程存储，不进入渲染进程日志）。' })
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

  const conversation = payload.messages.map((m) => ({ role: m.role, content: m.content }))

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
  const MAX_SAME_SNAPSHOT_REPEAT = 2
  const MAX_CONSECUTIVE_SNAPSHOT_TOOLS = 6

  try {
    for (let step = 1; step <= maxSteps; step++) {
      if (runCtx.userAborted) {
        send(wc, { type: 'cancelled', message: '已停止生成' })
        send(wc, { type: 'done' })
        return
      }

      send(wc, { type: 'status', text: `正在生成第 ${step} 步...` })

      const sysPrompt = buildSystemPrompt(payload, {
        lastToolResult: lastToolResult ? lastToolResult.slice(0, MAX_TOOL_RESULT_CHARS) : null,
        lastCommand,
        lastWriteOk
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

      const content = await callModelJson({
        apiKey,
        baseURL,
        model: settings.model,
        temperature,
        messages,
        timeoutMs,
        userAbortSignal: ac.signal
      })

      const jsonText = extractJsonObject(content)
      const parsed = assistantStepSchema.parse(JSON.parse(jsonText)) as unknown as AiAssistantReply
      const completed = typeof parsed.completed === 'boolean' ? parsed.completed : parsed.action === 'end'
      const structured: AiAssistantReply = { ...parsed, completed }

      // Only `command` steps require user confirmation.
      const toolName = parsed.toolName?.trim()
      const requestId = parsed.action === 'command' ? randomUUID() : undefined

      send(wc, { type: 'step', requestId, structured })

      if (parsed.action === 'end') {
        send(wc, { type: 'done' })
        return
      }

      // For command steps, wait for user confirmation before executing.
      if (parsed.action === 'command') {
        consecutiveSnapshotTools = 0
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
          send(wc, { type: 'cancelled', message: '已取消：你未同意执行该命令' })
          return
        }
      }

      if (parsed.action === 'tool_call') {
        const toolName = parsed.toolName?.trim()
        const toolInput = parsed.toolInput

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
              ? Math.min(500, Math.max(1, Math.floor(toolInput.maxLines)))
              : 200

          logAi('tool:get_terminal_snapshot exec', { maxLines, targetSessionId })

          const snap = ssh.getRingSnapshot(targetSessionId, maxLines)
          snapText =
            snap == null || !snap.trim() ? '（该会话暂无缓冲输出或会话已断开。）' : snap.trimEnd()
        }

        if (prevSnapFingerprint != null && snapText === prevSnapFingerprint) {
          sameSnapshotRepeat++
        } else {
          sameSnapshotRepeat = 0
        }
        prevSnapFingerprint = snapText

        lastToolResult = snapText
        lastCommand = null
        lastWriteOk = null
        consecutiveSnapshotTools++

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
      }

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
    console.error('[ai] Interactive agent failed, fallback to legacy streaming JSON chat:', msg)
    logAi('ai:interactive error', msg)
    await streamOpenAICompatibleChat(wc, settings, payload)
  } finally {
    if (activeAiChat?.ac === ac) activeAiChat = null
  }
}

