/** D52: ↑/↓ in the AI composer walks this conversation's earlier questions (newest first). */
export function userPrompts(lines: { role: string; content: string }[], max = 50): string[] {
  const out: string[] = []
  for (let i = lines.length - 1; i >= 0 && out.length < max; i--) {
    const l = lines[i]!
    const c = String(l.content ?? '').trim()
    if (l.role === 'user' && c && out[out.length - 1] !== c) out.push(c)
  }
  return out
}

/** Next cursor and text, or null when the key should keep its normal behavior. */
export function recallStep(
  prompts: string[],
  cursor: number,
  input: string,
  key: 'up' | 'down'
): { cursor: number; text: string } | null {
  const browsing = cursor >= 0 && input === prompts[cursor]
  if (key === 'up') {
    if (!(input === '' || browsing)) return null
    const next = browsing ? cursor + 1 : 0
    if (next >= prompts.length) return null
    return { cursor: next, text: prompts[next]! }
  }
  if (!browsing) return null
  return cursor === 0 ? { cursor: -1, text: '' } : { cursor: cursor - 1, text: prompts[cursor - 1]! }
}
