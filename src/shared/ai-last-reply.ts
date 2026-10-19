/** Last non-empty assistant message text (newest first). */
export function lastAssistantText(
  messages: ReadonlyArray<{ role?: string; content?: string }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'assistant') continue
    const c = String(m.content ?? '').trim()
    if (c) return c
  }
  return null
}
