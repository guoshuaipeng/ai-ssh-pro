import type { Dims } from '@shared/pty-follow'
/** D104: last size each session's owning pane sent to the PTY; follower panes listen for changes. */
export const PTY_SIZE_EVENT = 'aiss-pty-size'
const sizes = new Map<string, Dims>()
export function reportPtySize(sessionId: string, cols: number, rows: number): void {
  const prev = sizes.get(sessionId)
  if (prev && prev.cols === cols && prev.rows === rows) return
  sizes.set(sessionId, { cols, rows })
  window.dispatchEvent(new CustomEvent(PTY_SIZE_EVENT, { detail: { sessionId } }))
}
export function ptySizeOf(sessionId: string): Dims | undefined {
  return sizes.get(sessionId)
}
