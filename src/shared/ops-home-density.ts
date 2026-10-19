/**
 * Ops home density: driven by **panel/container width only**
 * (not window maximize / height). Same structure fullscreen and windowed;
 * card cap and secondary fold scale with width.
 */
export const OPS_HOME_QUIET_CARD_CAP = 6
export const OPS_HOME_WIDE_CARD_CAP = 8
/** Panel width at/under which the shortcut rail folds into ⋯. */
export const OPS_HOME_FOLD_RAIL_WIDTH = 1100
/** Panel width at/under which cards use the quiet cap. */
export const OPS_HOME_QUIET_WIDTH = 1366

export function opsHomeCardCap(width: number): number {
  const w = Number.isFinite(width) ? width : OPS_HOME_QUIET_WIDTH
  return w <= OPS_HOME_QUIET_WIDTH ? OPS_HOME_QUIET_CARD_CAP : OPS_HOME_WIDE_CARD_CAP
}

/**
 * @param width Panel (or window) width in CSS px.
 * @param _height Ignored — kept so call sites stay stable; layout must not depend on maximize/height.
 */
export function opsHomeQuietLayout(width: number, _height?: number): {
  cardCap: number
  foldSecondary: boolean
  noToolWall: boolean
} {
  const w = Number.isFinite(width) ? width : OPS_HOME_QUIET_WIDTH
  return {
    cardCap: opsHomeCardCap(w),
    foldSecondary: w <= OPS_HOME_FOLD_RAIL_WIDTH,
    noToolWall: true
  }
}
