/** D104: in split view a second pane on the SAME session must not resize the shared PTY. It follows the
 * PTY columns (so wraps match the primary) and only fits its own rows. */
export type Dims = { cols: number; rows: number }
export function followDims(fit: Dims | undefined, pty: Dims | undefined): Dims | null {
  if (!fit || !pty || !(pty.cols > 0) || !(fit.rows > 0)) return null
  return { cols: pty.cols, rows: fit.rows }
}
