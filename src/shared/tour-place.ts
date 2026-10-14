/** UX-38: place the welcome-tour card so it stays on screen and off action areas. */

export type Box = { left: number; top: number; width: number; height: number }
export type Side = 'right' | 'bottom' | 'left' | 'top'

const ORDER: Side[] = ['right', 'bottom', 'left', 'top']

function inflate(b: Box, pad: number): Box {
  return { left: b.left - pad, top: b.top - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
}

export function intersects(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top
}

export function overlapArea(a: Box, b: Box): number {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.left + a.width, b.left + b.width)
  const bottom = Math.min(a.top + a.height, b.top + b.height)
  if (right <= left || bottom <= top) return 0
  return (right - left) * (bottom - top)
}

function cardAt(side: Side, target: Box, card: { width: number; height: number }, gap: number): Box {
  if (side === 'right') return { left: target.left + target.width + gap, top: target.top, width: card.width, height: card.height }
  if (side === 'left') return { left: target.left - gap - card.width, top: target.top, width: card.width, height: card.height }
  if (side === 'bottom') return { left: target.left, top: target.top + target.height + gap, width: card.width, height: card.height }
  return { left: target.left, top: target.top - gap - card.height, width: card.width, height: card.height }
}

function inside(b: Box, vw: number, vh: number, margin: number): boolean {
  return b.left >= margin && b.top >= margin && b.left + b.width <= vw - margin && b.top + b.height <= vh - margin
}

function clamp(b: Box, vw: number, vh: number, margin: number): Box {
  const left = Math.max(margin, Math.min(b.left, vw - margin - b.width))
  const top = Math.max(margin, Math.min(b.top, vh - margin - b.height))
  return { ...b, left, top }
}

export type Placement = { left: number; top: number; side: Side; fits: boolean }

/**
 * Prefer right, then down, left, up.
 * A side wins when the card is fully on screen, misses the target (inflated 8px), and misses every avoid rect.
 * Otherwise pick the side whose avoid-overlap is smallest.
 */
export function placeTourCard(input: {
  target: Box
  avoids?: Box[]
  viewport: { width: number; height: number }
  card: { width: number; height: number }
  margin?: number
  gap?: number
}): Placement {
  const margin = input.margin ?? 12
  const gap = input.gap ?? 10
  const avoids = input.avoids ?? []
  const targetPad = inflate(input.target, 8)
  const vw = input.viewport.width
  const vh = input.viewport.height
  let best: { side: Side; box: Box; area: number } | null = null
  for (const side of ORDER) {
    const raw = cardAt(side, input.target, input.card, gap)
    const box = clamp(raw, vw, vh, margin)
    const onScreen = inside(raw, vw, vh, margin)
    const hitTarget = intersects(box, targetPad)
    const avoidArea = avoids.reduce((s, a) => s + overlapArea(box, a), 0)
    const clean = onScreen && !hitTarget && avoidArea === 0
    if (clean) return { left: box.left, top: box.top, side, fits: true }
    if (!best || avoidArea < best.area) best = { side, box, area: avoidArea }
  }
  const fallback = best ?? { side: 'right' as Side, box: clamp(cardAt('right', input.target, input.card, gap), vw, vh, margin), area: 0 }
  return { left: fallback.box.left, top: fallback.box.top, side: fallback.side, fits: false }
}
