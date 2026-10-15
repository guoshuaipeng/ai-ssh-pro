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
