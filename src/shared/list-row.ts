/**
 * P13-4: shared list/table row rhythm. Sidebar tree, alerts, toolbox, and SFTP
 * share one height and the theme row-hover tokens — no private blue hover.
 * Selected ≠ outline (P10) stays.
 */
export const LIST_ROW_HEIGHT_PX = 32
export const LIST_ROW_HEIGHT_COMPACT_PX = 24

export function listRowHeight(compact = false): number {
  return compact ? LIST_ROW_HEIGHT_COMPACT_PX : LIST_ROW_HEIGHT_PX
}
