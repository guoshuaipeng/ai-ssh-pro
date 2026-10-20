/** D77: connect handshake timeout (global, Settings → reconnect). */
export const CONNECT_TIMEOUT_DEFAULT_SEC = 20
export const CONNECT_TIMEOUT_PRESETS = [10, 20, 30, 60, 120] as const

export function clampConnectTimeoutSec(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return CONNECT_TIMEOUT_DEFAULT_SEC
  return Math.min(120, Math.max(5, Math.floor(n)))
}

export function readyTimeoutMs(v: unknown): number {
  return clampConnectTimeoutSec(v) * 1000
}

/** Whole seconds elapsed since `since`, never negative. */
export function elapsedSec(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / 1000))
}
