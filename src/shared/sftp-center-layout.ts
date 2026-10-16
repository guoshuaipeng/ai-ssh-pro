/**
 * P13-1: SFTP center at 1366×768 stays one quiet toolbar row.
 * Drive switch and “open at session cwd” stay prominent; advanced stays folded.
 * Does not reopen host profile (P12-4).
 */
export function sftpCenterComfortLayout(width: number, height: number): {
  toolbarNowrap: boolean
  driveProminent: boolean
  sessionCwdProminent: boolean
  listPreviewSplit: boolean
  advancedCollapsed: boolean
} {
  const w = Number.isFinite(width) ? width : 1366
  const h = Number.isFinite(height) ? height : 768
  const compact = w <= 1366 || h <= 768
  return {
    toolbarNowrap: true,
    driveProminent: true,
    sessionCwdProminent: true,
    listPreviewSplit: true,
    advancedCollapsed: compact
  }
}
