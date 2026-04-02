import type { WebContents } from 'electron'
import type { AiChatPayload, AiSettings, AiStreamEvent } from '../shared/ipc'

function send(wc: WebContents, ev: AiStreamEvent): void {
  if (!wc.isDestroyed()) {
    wc.send('ai:stream', ev)
  }
}

function buildMessages(payload: AiChatPayload): { role: string; content: string }[] {
  const systemParts: string[] = [
    '你是运维/开发助手，结合用户问题与终端上下文给出 Shell 与排错建议。',
    '你必须只输出一个 JSON 对象：不要使用 Markdown、不要代码围栏、不要输出任何 JSON 以外的文字。',
    'JSON 字段约定：',
    '- description（必填，字符串）：说明结论、步骤或原因，并提示是否需在用户确认后再执行命令。',
    '- command（可选，字符串）：建议用户在终端执行的单行完整命令；不需要命令时可省略或设为 ""；禁止换行。',
    '- riskLevel（必填，字符串）：风险等级，三选一：low、medium、high。',
    '- notes（可选，字符串）：补充注意点、回滚、备份或需先确认的信息。',
    '不要假设用户已执行命令；高风险操作须在 description/notes 中明确说明。'
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
  const base = settings.baseURL.replace(/\/$/, '')
  const url = `${base}/chat/completions`
  const apiKey = settings.apiKey.trim()
  if (!apiKey) {
    send(wc, { type: 'error', message: '请先在设置中填写 API Key（主进程存储，不进入渲染进程日志）。' })
    return
  }

  const messages = buildMessages(payload)

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
    send(wc, { type: 'error', message: `HTTP ${res.status}: ${t.slice(0, 500)}` })
    return
  }

  const body = res.body
  if (!body) {
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
          send(wc, { type: 'done' })
          return
        }
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[]
          }
          const piece = json.choices?.[0]?.delta?.content
          if (piece) send(wc, { type: 'delta', text: piece })
        } catch {
          /* 忽略非 JSON 行 */
        }
      }
    }
  } catch (e) {
    send(wc, { type: 'error', message: e instanceof Error ? e.message : String(e) })
    return
  }

  send(wc, { type: 'done' })
}
