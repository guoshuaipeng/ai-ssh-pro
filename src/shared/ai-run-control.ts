/** 2.2: AI loop run control — step limit, auto streak pause, and the stop guard on terminal writes. */

export const DEFAULT_AI_MAX_STEPS = 10
export const MIN_AI_MAX_STEPS = 1
export const MAX_AI_MAX_STEPS = 30

/** Consecutive auto-written non-read commands before the next one must Agree. */
export const DEFAULT_AI_AUTO_STREAK = 5
export const MIN_AI_AUTO_STREAK = 1
export const MAX_AI_AUTO_STREAK = 30

function toBounded(raw: unknown, min: number, max: number): number | null {
  const n = typeof raw === 'string' && raw.trim() ? Number(raw) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(n) || n < min) return null
  return Math.min(max, Math.floor(n))
}

function toSteps(raw: unknown): number | null {
  return toBounded(raw, MIN_AI_MAX_STEPS, MAX_AI_MAX_STEPS)
}

/** Settings value first, then the legacy AISS_MAX_POLLS environment variable, then the default. */
export function resolveAiMaxSteps(settingValue: unknown, envValue?: unknown): number {
  return toSteps(settingValue) ?? toSteps(envValue) ?? DEFAULT_AI_MAX_STEPS
}

/** Normalizes a value before it is stored; null removes the setting. */
export function normalizeAiMaxSteps(raw: unknown): number | null {
  return toSteps(raw)
}

export function resolveAiAutoStreak(settingValue: unknown): number {
  return toBounded(settingValue, MIN_AI_AUTO_STREAK, MAX_AI_AUTO_STREAK) ?? DEFAULT_AI_AUTO_STREAK
}

export function normalizeAiAutoStreak(raw: unknown): number | null {
  return toBounded(raw, MIN_AI_AUTO_STREAK, MAX_AI_AUTO_STREAK)
}

/** True when the next non-read auto candidate must wait for Agree. */
export function shouldForceConfirmAfterAutoStreak(streak: number, cap: number): boolean {
  const s = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0
  const c = resolveAiAutoStreak(cap)
  return s >= c
}

/** After an auto write of a non-read command, bump the streak; otherwise leave it. */
export function bumpAutoWriteStreak(streak: number, kind: string | null | undefined): number {
  if (kind === 'read' || kind == null) return Math.max(0, Math.floor(streak) || 0)
  return Math.max(0, Math.floor(streak) || 0) + 1
}

export type RunStopState = { userAborted: boolean }

/**
 * Every AI terminal write goes through here. After Stop (userAborted or the run signal aborted)
 * nothing is written and null is returned.
 */
export function writeUnlessStopped(state: RunStopState, signal: AbortSignal | undefined, write: () => boolean): boolean | null {
  if (state.userAborted || signal?.aborted) return null
  return write()
}
