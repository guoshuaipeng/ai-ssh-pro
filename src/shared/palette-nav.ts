/** PNG-3: Ctrl+K second navigation. Empty query keeps the eight groups; these four stay in this order. */

export const SECOND_NAV = ['connection', 'ops', 'settings', 'help'] as const

export type SecondNavId = (typeof SECOND_NAV)[number]

/** Relative order of 连接 / 运维 / 设置 / 帮助 inside an empty-query header list. */
export function secondNavOrder(headerIds: readonly string[]): SecondNavId[] {
  return SECOND_NAV.filter((id) => headerIds.includes(id))
}

export type PaletteKeyStep =
  | { type: 'move'; index: number }
  | { type: 'run' }
  | { type: 'close' }
  | { type: 'clear' }
  | { type: 'noop' }

/** ↑↓ move, Enter runs, Enter on an empty result clears (PF-4), Esc closes. */
export function paletteKeyStep(key: string, index: number, count: number): PaletteKeyStep {
  if (key === 'ArrowDown') {
    if (count <= 0) return { type: 'noop' }
    return { type: 'move', index: Math.min(count - 1, Math.max(0, index) + 1) }
  }
  if (key === 'ArrowUp') {
    if (count <= 0) return { type: 'noop' }
    return { type: 'move', index: Math.max(0, index - 1) }
  }
  if (key === 'Enter') return count <= 0 ? { type: 'clear' } : { type: 'run' }
  if (key === 'Escape') return { type: 'close' }
  return { type: 'noop' }
}

/**
 * The palette box used at a viewport. Matches `.cmdp { width: min(640px, 92vw); max-height: min(64vh, calc(100vh - 96px)) }`
 * and the 12vh top inset.
 */
export function paletteFrame(viewportWidth: number, viewportHeight: number): {
  width: number
  height: number
  top: number
  left: number
  fits: boolean
} {
  const width = Math.min(640, Math.round(viewportWidth * 0.92))
  const height = Math.min(Math.round(viewportHeight * 0.64), Math.max(0, viewportHeight - 96))
  const top = Math.round(viewportHeight * 0.12)
  const left = Math.round((viewportWidth - width) / 2)
  const fits = left >= 8 && top >= 8 && left + width <= viewportWidth - 8 && top + height <= viewportHeight - 8
  return { width, height, top, left, fits }
}
