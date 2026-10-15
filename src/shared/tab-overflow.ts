/** UX-55: the center tab strip stays one row. Extra tabs scroll or sit in an overflow menu. */

export function tabStripOverflow(opts: {
  containerWidth: number
  tabWidths: number[]
  reserved?: number
  gap?: number
}): { visibleCount: number; overflow: boolean; wraps: false } {
  const gap = opts.gap ?? 2
  const reserved = opts.reserved ?? 0
  let budget = Math.max(0, opts.containerWidth - reserved)
  let visible = 0
  for (const w of opts.tabWidths) {
    const need = w + (visible > 0 ? gap : 0)
    if (need > budget) break
    budget -= need
    visible += 1
  }
  if (visible === 0 && opts.tabWidths.length > 0 && opts.containerWidth > 0) visible = 1
  return { visibleCount: visible, overflow: visible < opts.tabWidths.length, wraps: false }
}
