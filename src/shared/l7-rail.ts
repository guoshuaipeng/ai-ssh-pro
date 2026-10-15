/** UX-52: L7 shortcut order and which rows stay visible when the rail is narrow. */

export const L7_RAIL = ['new', 'dashboard', 'playbook', 'sftp', 'syncFolder', 'import', 'update'] as const

export type L7RailId = (typeof L7_RAIL)[number]

/** Prefer these three when the column cannot hold every label. */
export const L7_RAIL_PRIORITY: L7RailId[] = ['new', 'dashboard', 'sftp']

export function railOverflow(railWidth: number): { visible: L7RailId[]; more: L7RailId[] } {
  if (railWidth >= 160) return { visible: [...L7_RAIL], more: [] }
  const visible = L7_RAIL.filter((id) => L7_RAIL_PRIORITY.includes(id))
  const more = L7_RAIL.filter((id) => !L7_RAIL_PRIORITY.includes(id))
  return { visible, more }
}

/** Right rail folds into the page-header menu below the three-column container. */
export function railCollapsed(contentWidth: number): boolean {
  return contentWidth < 1200
}
