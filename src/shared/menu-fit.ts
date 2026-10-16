/** PNG-2: a titlebar menu stays inside the window. Tall menus scroll instead of painting off-screen. */

export type MenuPlace = {
  top: number
  left: number
  maxHeight: number
  openUp: boolean
  /** True only when the clamped box still leaves the viewport. The clamp keeps this false. */
  clipped: boolean
}

export function placeMenuDropdown(input: {
  anchorTop: number
  anchorBottom: number
  anchorLeft: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}): MenuPlace {
  const margin = input.margin ?? 8
  const below = Math.max(0, input.viewportHeight - input.anchorBottom - margin)
  const above = Math.max(0, input.anchorTop - margin)
  const openUp = input.menuHeight > below && above > below
  const available = Math.max(0, openUp ? above : below)
  const maxHeight = Math.max(0, Math.min(input.menuHeight, available))
  const top = openUp ? Math.max(margin, input.anchorTop - maxHeight) : input.anchorBottom
  let left = input.anchorLeft
  if (left + input.menuWidth > input.viewportWidth - margin) {
    left = Math.max(margin, input.viewportWidth - margin - input.menuWidth)
  }
  const bottom = top + maxHeight
  const clipped =
    top < margin - 0.5 ||
    bottom > input.viewportHeight - margin + 0.5 ||
    left < margin - 0.5 ||
    left + input.menuWidth > input.viewportWidth - margin + 0.5
  return { top, left, maxHeight, openUp, clipped }
}

/** Rough row box used by the ops-menu fit check. Matches titlebar item padding + 13px type. */
export function estimatedMenuHeight(actions: number, seps: number): number {
  return actions * 32 + seps * 9 + 8
}
