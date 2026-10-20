/** D6: hand text to the AI composer even if the panel mounts later. */
export const AI_PREFILL_EVENT = 'aiss-ai-prefill'
export const AI_ASK_CONTEXT_EVENT = 'aiss-ai-ask-context'

let pending: string | null = null

export function setAiPrefill(text: string): void {
  pending = text
  window.setTimeout(() => window.dispatchEvent(new Event(AI_PREFILL_EVENT)), 60)
}

export function takeAiPrefill(): string | null {
  const t = pending
  pending = null
  return t
}

export function requestAskWithContext(sessionId: string, text: string): boolean {
  if (!text.trim()) return false
  window.dispatchEvent(new CustomEvent(AI_ASK_CONTEXT_EVENT, { detail: { sessionId, text } }))
  return true
}
