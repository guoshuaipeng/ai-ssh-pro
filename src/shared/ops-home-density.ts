/**
 * P13-6: ops home quiet density. Cards/badges stay under a quiet cap at 1366;
 * secondary actions live in CmdK / ⋯ — no tool wall. Does not reopen ops menu ≤12.
 */
export const OPS_HOME_QUIET_CARD_CAP = 6
export const OPS_HOME_WIDE_CARD_CAP = 8

export function opsHomeCardCap(width: number): number {
  const w = Number.isFinite(width) ? width : 1366
  return w <= 1366 ? OPS_HOME_QUIET_CARD_CAP : OPS_HOME_WIDE_CARD_CAP
}

export function opsHomeQuietLayout(width: number, height: number): {
  cardCap: number
  foldSecondary: boolean
  noToolWall: boolean
} {
  const w = Number.isFinite(width) ? width : 1366
  const h = Number.isFinite(height) ? height : 768
  const quiet = w <= 1366 || h <= 768
  return {
    cardCap: opsHomeCardCap(w),
    foldSecondary: quiet,
    noToolWall: true
  }
}
