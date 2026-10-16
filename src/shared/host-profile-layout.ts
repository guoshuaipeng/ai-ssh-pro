/**
 * P12-4: host profile at 1366×768 stays one column. Actions stay on one line.
 * Advanced (protection / dense service editor) starts collapsed — same rhythm as settings.
 */
export function hostProfileComfortLayout(width: number, height: number): {
  singleColumn: boolean
  actionsNowrap: boolean
  advancedCollapsed: boolean
} {
  const w = Number.isFinite(width) ? width : 1366
  const h = Number.isFinite(height) ? height : 768
  return {
    singleColumn: w <= 1366 || h <= 768,
    actionsNowrap: true,
    advancedCollapsed: true
  }
}
