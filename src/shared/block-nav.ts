/** D15: jump between command starts in the terminal (Ctrl+↑ / Ctrl+↓). */

/**
 * `lines` = buffer lines where commands started (ascending, disposed markers removed).
 * At the bottom, Ctrl+↑ goes to the latest command; otherwise relative to the top visible line.
 * Returns the index into `lines`, or null when there is nowhere to go.
 */
export function blockNavIndex(lines: number[], viewportTop: number, atBottom: boolean, dir: 'prev' | 'next'): number | null {
  if (!lines.length) return null
  if (dir === 'prev') {
    const ref = atBottom ? Number.POSITIVE_INFINITY : viewportTop
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i]! < ref) return i
    return null
  }
  if (atBottom) return null
  for (let i = 0; i < lines.length; i++) if (lines[i]! > viewportTop) return i
  return null
}

/** Ctrl+↑ / Ctrl+↓ without other modifiers. Not in full-screen apps (vim, less …). */
export function blockNavKey(ev: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }, alternate: boolean): 'prev' | 'next' | null {
  if (alternate || !ev.ctrlKey || ev.shiftKey || ev.altKey || ev.metaKey) return null
  return ev.key === 'ArrowUp' ? 'prev' : ev.key === 'ArrowDown' ? 'next' : null
}
