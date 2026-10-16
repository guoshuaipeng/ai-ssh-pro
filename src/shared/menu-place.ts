export type SubmenuAnchor = { left: number; right: number; top: number; bottom: number }

/**
 * Place a flyout beside its row. Prefer the right side. Flip left when that side
 * would leave the viewport, and move up when the bottom would clip.
 */
export function placeSubmenu(
  anchor: SubmenuAnchor,
  width: number,
  height: number,
  vw: number,
  vh: number,
  margin = 8
): { x: number; y: number; side: 'left' | 'right' } {
  const overlap = 4
  const roomRight = vw - margin - (anchor.right - overlap)
  const roomLeft = anchor.left + overlap - margin
  const side: 'left' | 'right' = roomRight >= width || roomRight >= roomLeft ? 'right' : 'left'
  let x = side === 'right' ? anchor.right - overlap : anchor.left + overlap - width
  if (x + width > vw - margin) x = vw - width - margin
  if (x < margin) x = margin
  let y = anchor.top
  if (y + height > vh - margin) y = anchor.bottom - height
  if (y + height > vh - margin) y = vh - height - margin
  if (y < margin) y = margin
  return { x, y, side }
}

/** Keep a context menu inside the viewport. Flip upward when the bottom would clip. */

export function placeMenu(
  x: number,
  y: number,
  width: number,
  height: number,
  vw: number,
  vh: number,
  margin = 8
): { x: number; y: number } {
  let left = x
  let top = y
  if (left + width > vw - margin) left = vw - width - margin
  if (left < margin) left = margin
  if (top + height > vh - margin) top = y - height
  if (top + height > vh - margin) top = vh - height - margin
  if (top < margin) top = margin
  return { x: left, y: top }
}
