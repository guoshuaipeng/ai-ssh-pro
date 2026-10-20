/** 2.2: AI loop run control — step limit and the stop guard on terminal writes. */

export const DEFAULT_AI_MAX_STEPS = 10
export const MIN_AI_MAX_STEPS = 1
export const MAX_AI_MAX_STEPS = 30

function toSteps(raw: unknown): number | null {
  const n = typeof raw === 'string' && raw.trim() ? Number(raw) : typeof raw === 'number' ? raw : NaN
  if (!Number.isFinite(n) || n < MIN_AI_MAX_STEPS) return null
  return Math.min(MAX_AI_MAX_STEPS, Math.floor(n))
}

/** Settings value first, then the legacy AISS_MAX_POLLS environment variable, then the default. */
export function resolveAiMaxSteps(settingValue: unknown, envValue?: unknown): number {
  return toSteps(settingValue) ?? toSteps(envValue) ?? DEFAULT_AI_MAX_STEPS
}

/** Normalizes a value before it is stored; null removes the setting. */
export function normalizeAiMaxSteps(raw: unknown): number | null {
  return toSteps(raw)
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
