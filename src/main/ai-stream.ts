import type { WebContents } from 'electron'
import type { AiChatPayload, AiSettings, AiStreamEvent } from '../shared/ipc'

function send(wc: WebContents, ev: AiStreamEvent): void {
  if (!wc.isDestroyed()) {
    wc.send('ai:stream', ev)
  }
}

function buildMessages(payload: AiChatPayload): { role: string; content: string }[] {
  const systemParts: string[] = [
    '你是运维/开发助手，帮助用户生成与解释 Shell 命令、分析终端输出。',
    '不要假设用户已确认执行命令；说明风险。回答简洁，必要时用 Markdown。'
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
