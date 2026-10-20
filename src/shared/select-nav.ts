/** C2: keyboard navigation for the themed Select. Pure, so it is unit-tested without a DOM. */

export type NavOption = { label: string; disabled?: boolean }

/** Next enabled index in dir, wrapping. Returns from when nothing is enabled. */
export function nextEnabled(options: readonly NavOption[], from: number, dir: 1 | -1): number {
  const n = options.length
  for (let k = 1; k <= n; k++) {
    const i = (((from + dir * k) % n) + n) % n
    if (!options[i]?.disabled) return i
  }
  return from
}

/**
 * Type-ahead: first enabled label starting with query. A single repeated letter cycles
 * from the item after start; a longer query searches from start itself.
 */
export function typeAheadIndex(options: readonly NavOption[], query: string, start: number): number {
  const q = query.toLowerCase()
  if (!q) return -1
  const n = options.length
  const offset = q.length > 1 ? 0 : 1
  const base = Math.max(start, 0)
  for (let k = 0; k < n; k++) {
    const i = (base + offset + k) % n
    const o = options[i]!
    if (!o.disabled && o.label.toLowerCase().startsWith(q)) return i
  }
  return -1
}

/** Count native <select> openings in source text (comments are not stripped; keep them out of TSX). */
export function countNativeSelects(src: string): number {
  return (src.match(/<select[\s>]/g) || []).length
}
