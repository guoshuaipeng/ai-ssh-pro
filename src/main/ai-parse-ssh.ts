import type { AiParsedSshForm, AiSettings } from '../shared/ipc'

const SYSTEM_BASE = `你是 SSH 连接信息解析器。用户会粘贴一段任意文本（可能含 IP、域名、端口、用户名、密码、私钥路径、会话备注、表格或运维工单片段）。
规则：
1) 只提取文本中明确出现的信息，禁止编造主机或凭据。
2) 端口缺省时不要猜，可省略 port 键。
3) 输出必须是单个 JSON 对象，不要 Markdown 代码块，不要其它说明文字。
4) 允许的键（均为可选）：label, host, port, username, password, privateKeyPath, passphrase, notes。
5) port 必须是数字。notes 可简短列出未映射进其它字段的提示。`

function extractJsonFromModelText(text: string): unknown {
  const t = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  const body = (fenced ? fenced[1] : t).trim()
  return JSON.parse(body) as unknown
}

function normalizeParsed(raw: unknown): AiParsedSshForm {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const o = raw as Record<string, unknown>
  const portRaw = o.port
  let port: number | undefined
  if (typeof portRaw === 'number' && Number.isFinite(portRaw)) {
    port = Math.round(portRaw)
  } else if (typeof portRaw === 'string' && /^\d+$/.test(portRaw.trim())) {
    port = parseInt(portRaw.trim(), 10)
  }
  const str = (k: string): string | undefined => {
    const v = o[k]
    return typeof v === 'string' ? v.trim() || undefined : undefined
  }
  return {
    label: str('label'),
    host: str('host'),
    port,
    username: str('username'),
    password: str('password'),
    privateKeyPath: str('privateKeyPath'),
    passphrase: str('passphrase'),
    notes: str('notes')
  }
}

export async function parseSshFormWithAi(rawText: string, settings: AiSettings): Promise<AiParsedSshForm> {
  const trimmed = rawText.trim()
  if (!trimmed) {
    throw new Error('请先粘贴需要解析的文字')
  }
  const apiKey = settings.apiKey.trim()
  if (!apiKey) {
    throw new Error('请先在左侧「AI 配置」中填写 API Key')
  }
  const base = settings.baseURL.replace(/\/$/, '')
  const url = `${base}/chat/completions`

  let system = SYSTEM_BASE
  const custom = settings.sshParseInstructions?.trim()
  if (custom) {
    system += `\n\n【用户自定义拆分规则】\n${custom}`
  }

  const bodyBase = {
    model: settings.model,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: trimmed.slice(0, 12000) }
    ],
    temperature: 0.1
  }

  async function post(extra: Record<string, unknown>): Promise<Response> {
    return await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...bodyBase, ...extra })
    })
  }

  let res = await post({ response_format: { type: 'json_object' } })
  if (!res.ok && res.status === 400) {
    res = await post({})
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`解析请求失败 HTTP ${res.status}: ${t.slice(0, 400)}`)
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = json.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('模型未返回有效内容')
  }
  let parsed: unknown
  try {
    parsed = extractJsonFromModelText(content)
  } catch (e) {
    throw new Error(`解析 JSON 失败：${e instanceof Error ? e.message : String(e)}`)
  }
  return normalizeParsed(parsed)
}
