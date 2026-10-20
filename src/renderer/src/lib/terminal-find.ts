/** Ctrl+Shift+F: open the find bar in the active terminal. */
export const AISS_TERMINAL_FIND_EVENT = 'aiss-terminal-find'

export function requestTerminalFind(): void {
  window.dispatchEvent(new Event(AISS_TERMINAL_FIND_EVENT))
}

/**
 * Case-insensitive search over terminal buffer lines.
 * Starts after (or before, when backwards) `from`; wraps around once. Returns null when there is no match.
 */
export function findInBuffer(
  lines: string[],
  query: string,
  from: { row: number; col: number } | null,
  backwards = false
): { row: number; col: number } | null {
  const q = query.toLowerCase()
  if (!q || !lines.length) return null
  const lower = lines.map((l) => l.toLowerCase())
  const n = lower.length
  if (!backwards) {
    let startRow = from ? from.row : 0
    let startCol = from ? from.col + 1 : 0
    for (let k = 0; k <= n; k++) {
      const r = (startRow + k) % n
      const idx = lower[r]!.indexOf(q, k === 0 ? startCol : 0)
      if (idx >= 0 && !(k === n && from && idx >= from.col + 1)) return { row: r, col: idx }
      if (k === 0) startCol = 0
    }
    return null
  }
  const startRow = from ? from.row : n - 1
  for (let k = 0; k <= n; k++) {
    const r = (((startRow - k) % n) + n) % n
    const line = lower[r]!
    const end = k === 0 && from ? from.col - 1 : line.length
    if (end < 0) continue
    const idx = line.lastIndexOf(q, end)
    if (idx >= 0) return { row: r, col: idx }
  }
  return null
}

export type FindOptions = { caseSensitive?: boolean; regex?: boolean }
export type FindMatch = { row: number; col: number; len: number }

/** Compile the query; returns an error key for an invalid regex. Plain text is escaped. */
export function compileFind(query: string, opts: FindOptions = {}): { re: RegExp | null; error: 'regex' | null } {
  if (!query) return { re: null, error: null }
  const src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return { re: new RegExp(src, opts.caseSensitive ? 'g' : 'gi'), error: null }
  } catch {
    return { re: null, error: 'regex' }
  }
}

/** All matches in buffer order (capped); zero-length regex matches are skipped. */
export function findAllInBuffer(lines: string[], query: string, opts: FindOptions = {}, cap = 5000): FindMatch[] {
  const { re } = compileFind(query, opts)
  if (!re) return []
  const out: FindMatch[] = []
  for (let row = 0; row < lines.length && out.length < cap; row++) {
    const line = lines[row]!
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) && out.length < cap) {
      if (!m[0].length) {
        re.lastIndex += 1
        continue
      }
      out.push({ row, col: m.index, len: m[0].length })
    }
  }
  return out
}

/** Index of the next (or previous) match relative to `from`, wrapping; -1 when none. */
export function pickMatch(matches: FindMatch[], from: { row: number; col: number } | null, backwards = false): number {
  if (!matches.length) return -1
  if (!from) return backwards ? matches.length - 1 : 0
  const after = (m: FindMatch) => m.row > from.row || (m.row === from.row && m.col > from.col)
  if (!backwards) {
    const i = matches.findIndex(after)
    return i >= 0 ? i : 0
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!
    if (m.row < from.row || (m.row === from.row && m.col < from.col)) return i
  }
  return matches.length - 1
}

/** Selection text usable as an initial query (single line, trimmed, ≤ 200 chars). */
export function seedQueryFromSelection(sel: string): string {
  const s = String(sel ?? '').split(/\r?\n/)[0]!.trim()
  return s.length > 200 ? '' : s
}
