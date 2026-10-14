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
