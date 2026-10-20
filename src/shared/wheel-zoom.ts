/** D99: Ctrl+wheel zoom for the terminal font. Accumulates trackpad deltas so one notch = one step. */
export const WHEEL_ZOOM_THRESHOLD = 50

export function wheelZoomStep(acc: number, deltaY: number): { step: -1 | 0 | 1; acc: number } {
  const next = acc + deltaY
  if (next <= -WHEEL_ZOOM_THRESHOLD) return { step: 1, acc: 0 }
  if (next >= WHEEL_ZOOM_THRESHOLD) return { step: -1, acc: 0 }
  return { step: 0, acc: next }
}
