/** Terminal font size zoom helpers (pure). */

export const TERMINAL_FONT_MIN = 10
export const TERMINAL_FONT_MAX = 32
export const TERMINAL_FONT_DEFAULT = 14

export function clampTerminalFontSize(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return TERMINAL_FONT_DEFAULT
  return Math.min(TERMINAL_FONT_MAX, Math.max(TERMINAL_FONT_MIN, Math.round(v)))
}

export function bumpTerminalFontSize(current: number, delta: number): number {
  return clampTerminalFontSize(clampTerminalFontSize(current) + delta)
}

export function resetTerminalFontSize(): number {
  return TERMINAL_FONT_DEFAULT
}
