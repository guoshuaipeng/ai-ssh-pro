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
  privateKeyPath?: string
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
  model: string
  apiKey: string
}
