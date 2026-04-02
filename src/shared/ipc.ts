/** 主菜单 / 工具栏打开的对话框类型 */
export type AppDialogKind = 'connection' | 'ai'

export type SessionMeta = {
  host: string
  port: number
  username: string
  label?: string
  connectedAt: number
  termCols: number
  termRows: number
}

export type SshConnectOptions = {
  host: string
  port?: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  label?: string
  termCols?: number
  termRows?: number
}

export type SshConnectResult = {
  sessionId: string
  meta: SessionMeta
}

export type SshDataEvent = {
  sessionId: string
  chunk: string
}

export type SshStatusEvent = {
  sessionId: string
  status: 'connected' | 'error' | 'closed'
  message?: string
}

export type SavedSessionProfile = {
  id: string
  label: string
  host: string
  port: number
  username: string
  /** 与连接表单一致；保存会话时写入，侧栏一键连接时使用 */
  password?: string
  privateKeyPath?: string
  passphrase?: string
}

export type AiChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type AiChatPayload = {
  messages: AiChatMessage[]
  targetSessionId?: string
  terminalExcerpt?: string
}

export type AiStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type AiSettings = {
  baseURL: string
  /** 当前请求使用的模型 ID（须在 modelList 中） */
  model: string
  /** 可切换的模型 ID 列表（去重、非空） */
  modelList: string[]
  apiKey: string
  /** 对话采样温度 0–2 */
  temperature: number
  /**
   * 自定义说明：模型应如何从用户粘贴的整段文字里拆分 SSH 连接信息（主机、端口、用户等）。
   * 可与默认规则叠加。
   */
  sshParseInstructions: string
}

/** AI 助手单轮回复（模型应仅输出 JSON，解析成功后用于展示与「执行」建议命令） */
export type AiAssistantReply = {
  /** 面向用户的说明与结论 */
  description: string
  /** 建议执行的完整命令；单行，勿含换行 */
  command?: string
  /** 风险等级，如 low / medium / high */
  riskLevel: string
  /** 补充注意点、回滚或确认项 */
  notes?: string
}

/** 从模型输出中解析 AiAssistantReply；支持外层 ```json 围栏或前后杂质 */
export function parseAiAssistantReply(raw: string): AiAssistantReply | null {
  let s = raw.trim()
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/im
  const fm = s.match(fence)
  if (fm) s = fm[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  try {
    const obj = JSON.parse(s) as Record<string, unknown>
    const description = typeof obj.description === 'string' ? obj.description.trim() : ''
    if (!description) return null
    const riskLevel = typeof obj.riskLevel === 'string' && obj.riskLevel.trim() ? obj.riskLevel.trim() : 'medium'
    let command: string | undefined
    if (typeof obj.command === 'string' && obj.command.trim()) {
      command = obj.command.replace(/\r\n/g, '\n').replace(/[\r\n]+/g, ' ').trim()
    }
    const notes = typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : undefined
    return { description, command, riskLevel, notes }
  } catch {
    return null
  }
}

/** AI 解析粘贴文本后得到的连接表单字段（均为可选，仅填文本中明确出现的信息） */
export type AiParsedSshForm = {
  label?: string
  host?: string
  port?: number
  username?: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  /** 未能归入字段的说明 */
  notes?: string
}
