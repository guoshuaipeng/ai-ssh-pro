import type { WebContents } from 'electron'
import type { AiChatPayload, AiSettings, AiStreamEvent } from '../shared/ipc'

function send(wc: WebContents, ev: AiStreamEvent): void {
  if (!wc.isDestroyed()) {
    wc.send('ai:stream', ev)
  }
}

const DEBUG_AI =
  process.env.AISS_LOG_AI_INTERACTIONS === '1' ||
  process.env.AISS_LOG_AI === '1' ||
  process.env.NODE_ENV === 'development'

function logAi(...args: unknown[]): void {
  if (!DEBUG_AI) return
  console.log('[ai-log]', ...args)
}

function trimForLog(s: string, max = 2000): string {
  // Keep original unicode text so terminal can display Chinese directly.
  const t = s.replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return t.slice(0, max) + `...(trimmed ${t.length - max} chars)`
}

function redactTerminalExcerptFromSystemPrompt(systemPrompt: string): string {
  // Default: don't leak terminal output into logs.
  // Opt-in: set `AISS_LOG_AI_PROMPT_FULL=1` to include it.
  if (process.env.AISS_LOG_AI_PROMPT_FULL === '1') return systemPrompt

  const redactedBlock = '\n```\n[REDACTED terminal excerpt]\n```'

  // Different wording in legacy vs langgraph code paths.
  const re1 = /用户提供的终端片段[\s\S]*?\n```\n[\s\S]*?\n```/m
  const re2 = /用户随消息附带的终端片段[\s\S]*?\n```\n[\s\S]*?\n```/m

  return systemPrompt
    .replace(re1, (m) => {
      const head = m.split('\n```')[0] // keep "用户提供的终端片段..." prefix
      return head.trimEnd() + redactedBlock
    })
    .replace(re2, (m) => {
      const head = m.split('\n```')[0]
      return head.trimEnd() + redactedBlock
    })
}

function buildMessages(payload: AiChatPayload): { role: string; content: string }[] {
  const systemParts: string[] = [
    '你是运维/开发助手，必须以“分步动作”方式工作：每一轮只决定下一步要做什么，并输出给 UI。UI 再根据用户同意触发工具或执行命令，然后把最新终端输出（terminalExcerpt）回传给你进行下一轮判断。',
    '你必须只输出一个 JSON 对象：不要使用 Markdown、不要代码围栏、不要输出任何 JSON 以外的文字。',
    '下一步动作 action 只能在三者中选一：',
    '- action=tool_call：请求 UI 调用工具 `get_terminal_snapshot` 获取最近终端输出证据（本回合不要给 command）',
    '- action=command：请求 UI 执行你给出的单行命令（本回合不要给 toolName/toolInput）',
    '- action=end：任务完成（本回合不要给 command/toolName）',
    'JSON 字段约定（严格）：',
    '- description（必填，字符串）：说明你为什么选择该动作、当前掌握的证据/结论，以及下一步用户需要理解/确认的要点',
    '- action（必填，字符串）：只能取 `tool_call` / `command` / `end`',
    '- completed（必填，布尔）：true 表示 action=end 且无需再继续；false 表示需要继续分步',
    '- toolName（可选，字符串）：当 action=tool_call 时必须为 `get_terminal_snapshot`',
    '- toolInput（可选，对象）：当 action=tool_call 时给出 `{ "maxLines": number }`（1-500）',
    '- command（可选，字符串）：当 action=command 时给出“单行完整命令”；禁止换行；不要包含回车符',
    '- riskLevel（必填，字符串）：low / medium / high',
    '- notes（可选，字符串）：补充注意点、回滚、确认事项或备选命令',
    '用户同意规则：无论 action=tool_call 还是 action=command，都视为“请求”，必须等待用户点确认后再执行下一步；你自己不要执行任何东西。',
    '何时必须 action=end（强约束）：终端片段或上下文已能回答用户问题（含已显示 ls/目录列表/报错等）时，必须 end 并简要总结，禁止再建议实质相同的 command（如重复的 ls -la）；若与上一轮建议命令等价且输出已在上下文中，也必须 end。',
    '风险建议：',
    '- tool_call 以及纯读取命令（只读证据）优先用 low',
    '- 可能修改服务/重启/重载的命令用 medium/high，并在 notes 明确写“需确认/可能影响业务/回滚建议”。'
  ]
  if (payload.targetSessionId) {
    systemParts.push(`当前关联的 SSH 会话 ID：${payload.targetSessionId}（仅作上下文，不要当作秘密）。`)
  }
  if (payload.terminalExcerpt?.trim()) {
    systemParts.push('用户提供的终端片段（可能含敏感信息）：\n```\n' + payload.terminalExcerpt.trim() + '\n```')
  }
  const system = systemParts.join('\n')
  const out: { role: string; content: string }[] = [{ role: 'system', content: system }]
  for (const m of payload.messages) {
    out.push({ role: m.role, content: m.content })
  }
  return out
}

export async function streamOpenAICompatibleChat(
  wc: WebContents,
  settings: AiSettings,
  payload: AiChatPayload
): Promise<void> {
  const provider = settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0]
  if (!provider) {
    logAi('ai:chat legacy error', 'missing provider')
    send(wc, { type: 'error', message: '未找到有效的 AI Provider 配置' })
    return
  }

  const base = provider.baseURL.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const apiKey = provider.apiKey.trim()
  if (!apiKey) {
    logAi('ai:chat legacy error', 'missing apiKey')
    send(wc, { type: 'error', message: '请先在设置中填写 API Key（主进程存储，不进入渲染进程日志）。' })
    return
  }

  const messages = buildMessages(payload)

  let deltaCount = 0
  let deltaChars = 0

  const systemPrompt = messages[0]?.content ?? ''
  const systemPromptForLog = redactTerminalExcerptFromSystemPrompt(systemPrompt)
  logAi('ai:chat legacy start', {
    model: settings.model,
    targetSessionId: payload.targetSessionId ?? null,
    messagesCount: payload.messages.length,
    systemPrompt: trimForLog(systemPromptForLog, 8000),
    // For optimization, also include the roles + user/assistant contents (truncated).
    conversation: payload.messages.map((m) => ({
      role: m.role,
      content: trimForLog(m.content, 800)
    }))
  })

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
        temperature:
          typeof settings.temperature === 'number' && Number.isFinite(settings.temperature)
            ? Math.min(2, Math.max(0, settings.temperature))
            : 0.1
      })
    })
  } catch (e) {
    send(wc, {
      type: 'error',
      message: e instanceof Error ? e.message : String(e)
    })
    return
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '')
    logAi('ai:chat legacy http error', { status: res.status, preview: t.slice(0, 200) })
    send(wc, { type: 'error', message: `HTTP ${res.status}: ${t.slice(0, 500)}` })
    return
  }

  const body = res.body
  if (!body) {
    logAi('ai:chat legacy error', 'empty response body')
    send(wc, { type: 'error', message: '响应无 body' })
    return
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let carry = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      carry += decoder.decode(value, { stream: true })
      const lines = carry.split('\n')
      carry = lines.pop() ?? ''
      for (const line of lines) {
        const s = line.trim()
        if (!s.startsWith('data:')) continue
        const data = s.slice(5).trim()
        if (data === '[DONE]') {
          logAi('ai:chat legacy done', { deltaCount, deltaChars })
          send(wc, { type: 'done' })
          return
        }
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[]
          }
          const piece = json.choices?.[0]?.delta?.content
          if (piece) {
            deltaCount += 1
            deltaChars += piece.length
            send(wc, { type: 'delta', text: piece })
          }
        } catch {
          /* 忽略非 JSON 行 */
        }
      }
    }
  } catch (e) {
    logAi('ai:chat legacy error', e instanceof Error ? e.message : String(e))
    send(wc, { type: 'error', message: e instanceof Error ? e.message : String(e) })
    return
  }

  send(wc, { type: 'done' })
}
