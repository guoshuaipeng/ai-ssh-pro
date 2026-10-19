/** Persist richer AI chat steps without breaking older role+content-only stores. */

import { parseAiAssistantReply, type AiAssistantReply, type AiChatMessage } from './ipc'

const CONTENT_MAX = 20000
const ID_MAX = 96
const DECISIONS = new Set(['agreed', 'skipped'])

/** Drop unknown keys; keep optional step fields when they look valid. */
export function normalizeAiChatMessage(raw: unknown): AiChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const role = row.role
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null
  const content = String(row.content ?? '').slice(0, CONTENT_MAX)
  const out: AiChatMessage = { role, content }
  if (role !== 'assistant') return out

  if (typeof row.requestId === 'string') {
    const id = row.requestId.trim().slice(0, ID_MAX)
    if (id) out.requestId = id
  }
  if (typeof row.decision === 'string' && DECISIONS.has(row.decision)) {
    out.decision = row.decision as 'agreed' | 'skipped'
  }
  if (typeof row.safetyMode === 'string' && row.safetyMode.trim()) {
    out.safetyMode = row.safetyMode.trim()
  }
  if (row.parseMiss === true) out.parseMiss = true
  if (row.structured != null) {
    const parsed =
      typeof row.structured === 'string'
        ? parseAiAssistantReply(row.structured)
        : parseAiAssistantReply(JSON.stringify(row.structured))
    if (parsed) out.structured = compactStructured(parsed)
  }
  return out
}

function compactStructured(s: AiAssistantReply): AiAssistantReply {
  return {
    description: String(s.description ?? '').slice(0, 4000),
    action: s.action,
    completed: s.completed,
    toolName: s.toolName ? String(s.toolName).slice(0, 120) : undefined,
    toolInput: s.toolInput,
    command: s.command ? String(s.command).slice(0, 4000) : undefined,
    riskLevel: String(s.riskLevel || 'medium').slice(0, 32),
    notes: s.notes ? String(s.notes).slice(0, 2000) : undefined
  }
}

export function normalizeAiChatHistory(rows: unknown): AiChatMessage[] {
  if (!Array.isArray(rows)) return []
  const out: AiChatMessage[] = []
  for (const row of rows) {
    const m = normalizeAiChatMessage(row)
    if (m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system')) out.push(m)
  }
  return out.slice(-200)
}

/** Strip streaming-only noise before writing electron-store. */
export function serializeAiChatHistory(messages: AiChatMessage[]): AiChatMessage[] {
  return normalizeAiChatHistory(messages).filter((m) => m.role === 'user' || m.role === 'assistant')
}
