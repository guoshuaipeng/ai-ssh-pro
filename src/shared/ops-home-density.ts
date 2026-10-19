/**
 * M17 (0.6.55) ops home: ONE centred column (max 1080px), three sections
 * (需要处理 → 主机 → 快捷). Wide and narrow share the structure; only the host-grid
 * column count and, under 760px, two-line attention rows change (CSS container query).
 */
export const OPS_HOME_MAX_WIDTH = 1080
/** Container width under which attention rows wrap to two lines and padding tightens. */
export const OPS_HOME_TWO_LINE_WIDTH = 760
/** Host tiles: `repeat(auto-fill, minmax(240px, 1fr))`. */
export const OPS_HOME_TILE_MIN = 240
export const OPS_HOME_GRID_GAP = 16
/** At most this many host tiles; the rest live behind "在看板中查看全部 →". */
export const OPS_HOME_CARD_CAP = 8
/** At most this many attention rows; the rest behind "在告警工作台查看". */
export const OPS_HOME_ATTENTION_CAP = 5

export type OpsRowLayout = 'one-line' | 'two-line'

export function opsHomeRowLayout(containerWidth: number): OpsRowLayout {
  return Number.isFinite(containerWidth) && containerWidth < OPS_HOME_TWO_LINE_WIDTH ? 'two-line' : 'one-line'
}

/** Mirrors the CSS grid so tests (and arrow-key nav fallbacks) agree with what renders. */
export function opsHomeGridColumns(containerWidth: number): number {
  const w = Number.isFinite(containerWidth) ? containerWidth : OPS_HOME_MAX_WIDTH
  const pad = w < OPS_HOME_TWO_LINE_WIDTH ? 16 : 24
  const inner = Math.min(w - pad * 2, OPS_HOME_MAX_WIDTH - 48)
  return Math.max(1, Math.floor((inner + OPS_HOME_GRID_GAP) / (OPS_HOME_TILE_MIN + OPS_HOME_GRID_GAP)))
}
