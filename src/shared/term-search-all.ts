/** D60: search the scrollback of every open terminal tab at once. Pure helpers. */

export type TermSource = { sessionId: string; label: string; lines: string[] }
export type TermHit = { sessionId: string; label: string; row: number; text: string }

export const SEARCH_ALL_MIN = 2
export const SEARCH_ALL_CAP = 200
const SNIPPET = 160

/** Case-insensitive substring search across tabs, newest lines first within a tab, capped overall. */
export function searchSessions(sources: TermSource[], query: string, cap = SEARCH_ALL_CAP): TermHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < SEARCH_ALL_MIN) return []
  const out: TermHit[] = []
  for (const s of sources) {
    for (let r = s.lines.length - 1; r >= 0; r--) {
      const line = s.lines[r] ?? ''
      const idx = line.toLowerCase().indexOf(q)
      if (idx < 0) continue
      const start = Math.max(0, idx - 40)
      const text = (start > 0 ? '…' : '') + line.slice(start, start + SNIPPET).trimEnd()
      out.push({ sessionId: s.sessionId, label: s.label, row: r, text })
      if (out.length >= cap) return out
    }
  }
  return out
}

/** Hits per tab, for the summary line. */
export function hitsPerSession(hits: TermHit[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const h of hits) m.set(h.sessionId, (m.get(h.sessionId) ?? 0) + 1)
  return m
}
