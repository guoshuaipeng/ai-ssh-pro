/** L9: global reconnect policy. Standard matches UX-14 (2s / 5s / 10s, 3 tries). */

import { autoReconnectDelay } from './workspace-features'

export type ReconnectMode = 'off' | 'standard' | 'robust' | 'custom'

export type ReconnectPolicy = {
  mode: ReconnectMode
  /** Robust series length. Clamped to 3–8. Default 5. */
  robustMaxAttempts: number
  /** Custom gaps in seconds. Each value must be 1–120. */
  customDelaysSec: number[]
  /** Custom series length. Clamped to 1–10. */
  customMaxAttempts: number
  /** null or 0 = off. Presets 30/60/120. Custom 15–300. */
  keepAliveSec: number | null
  /** When true, a failed jump can resume at that hop. This batch defaults to on. */
  jumpRetryFromFailedHop: boolean
}

export const RECONNECT_POLICY_KEY = 'aiss.reconnect.policy.v1'
export const ROBUST_DELAYS_MS = [2000, 5000, 10_000, 20_000, 40_000] as const
export const KEEPALIVE_PRESETS = [30, 60, 120] as const

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  mode: 'standard',
  robustMaxAttempts: 5,
  customDelaysSec: [2, 5, 10, 20],
  customMaxAttempts: 4,
  keepAliveSec: null,
  jumpRetryFromFailedHop: true
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

export function normalizeReconnectPolicy(raw: unknown): ReconnectPolicy {
  const base = { ...DEFAULT_RECONNECT_POLICY, customDelaysSec: [...DEFAULT_RECONNECT_POLICY.customDelaysSec] }
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Partial<ReconnectPolicy>
  const mode: ReconnectMode = o.mode === 'off' || o.mode === 'robust' || o.mode === 'custom' || o.mode === 'standard' ? o.mode : 'standard'
  const delays = Array.isArray(o.customDelaysSec)
    ? o.customDelaysSec.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 120).slice(0, 10)
    : base.customDelaysSec
  let keep: number | null = null
  if (typeof o.keepAliveSec === 'number' && Number.isFinite(o.keepAliveSec) && o.keepAliveSec > 0) {
    keep = clampInt(o.keepAliveSec, 15, 300, 60)
  }
  return {
    mode,
    robustMaxAttempts: clampInt(Number(o.robustMaxAttempts), 3, 8, 5),
    customDelaysSec: delays.length ? delays : base.customDelaysSec,
    customMaxAttempts: clampInt(Number(o.customMaxAttempts), 1, 10, 4),
    keepAliveSec: keep,
    jumpRetryFromFailedHop: o.jumpRetryFromFailedHop !== false
  }
}

export function loadReconnectPolicy(store: Pick<Storage, 'getItem'> = globalThis.localStorage): ReconnectPolicy {
  try {
    const raw = store.getItem(RECONNECT_POLICY_KEY)
    if (!raw) return normalizeReconnectPolicy(null)
    return normalizeReconnectPolicy(JSON.parse(raw))
  } catch {
    return normalizeReconnectPolicy(null)
  }
}

export function saveReconnectPolicy(policy: ReconnectPolicy, store: Store = globalThis.localStorage): ReconnectPolicy {
  const next = normalizeReconnectPolicy(policy)
  store.setItem(RECONNECT_POLICY_KEY, JSON.stringify(next))
  return next
}

/** Parse "2, 5, 10". Invalid rows stay uncommitted so the last good policy remains. */
export function parseDelaySeconds(text: string): { ok: true; delaysSec: number[] } | { ok: false } {
  const parts = text.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length || parts.length > 10) return { ok: false }
  const delaysSec: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return { ok: false }
    const n = Number(part)
    if (n < 1 || n > 120) return { ok: false }
    delaysSec.push(n)
  }
  return { ok: true, delaysSec }
}

export function parseKeepAliveSec(text: string): { ok: true; sec: number } | { ok: false } {
  if (!/^\d+$/.test(text.trim())) return { ok: false }
  const n = Number(text.trim())
  if (n < 15 || n > 300) return { ok: false }
  return { ok: true, sec: n }
}

export function maxAttemptsFor(policy: ReconnectPolicy): number {
  if (policy.mode === 'off') return 0
  if (policy.mode === 'standard') return 3
  if (policy.mode === 'robust') return policy.robustMaxAttempts
  return policy.customMaxAttempts
}

/** 1-based attempt. null = the series is over. Standard is exactly UX-14. */
export function delayForAttempt(policy: ReconnectPolicy, attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 1) return null
  if (policy.mode === 'off') return null
  if (policy.mode === 'standard') return autoReconnectDelay(attempt)
  const max = maxAttemptsFor(policy)
  if (attempt > max) return null
  if (policy.mode === 'robust') return ROBUST_DELAYS_MS[Math.min(attempt, ROBUST_DELAYS_MS.length) - 1] ?? 40_000
  const delays = policy.customDelaysSec.length ? policy.customDelaysSec : DEFAULT_RECONNECT_POLICY.customDelaysSec
  const sec = delays[Math.min(attempt, delays.length) - 1] ?? delays[delays.length - 1]!
  return sec * 1000
}

/**
 * ssh2 keepalive interval. undefined keeps the historical 15s for callers that
 * do not know about L9. null/0 turns probes off (the settings default).
 */
export function keepaliveIntervalMs(sec: number | null | undefined): number {
  if (sec === undefined) return 15_000
  if (sec === null || sec <= 0) return 0
  return clampInt(sec, 15, 300, 60) * 1000
}

export function secondsRemaining(delayMs: number, startedAt: number, now: number): number {
  if (delayMs <= 0) return 0
  return Math.max(0, Math.ceil((startedAt + delayMs - now) / 1000))
}

/**
 * 1-based hop to start from. Earlier hops are already up and must not repeat
 * host-key confirmation. A full reconnect, a first-hop failure, or the
 * preference being off starts at hop 1.
 */
export function resumeStartHop(totalHops: number, failedHop: number | null | undefined, preferFromFailed: boolean, full: boolean): number {
  if (full || !preferFromFailed) return 1
  if (!failedHop || failedHop < 2) return 1
  if (!Number.isInteger(totalHops) || totalHops < 2) return 1
  if (failedHop > totalHops) return 1
  return failedHop
}

/** Hops whose host key is checked on this attempt. Reused hops are omitted. */
export function hopsReconfirmed(totalHops: number, startHop: number): number[] {
  const start = Math.max(1, Math.floor(startHop) || 1)
  const total = Math.max(0, Math.floor(totalHops) || 0)
  const out: number[] = []
  for (let i = start; i <= total; i++) out.push(i)
  return out
}

export type StagedCommand = { command: string; confirmed: boolean; dangerous: boolean }

/**
 * A reconnect restores the socket only. Unconfirmed dangerous commands and any
 * unsent buffer stay unsent. The list is always empty on purpose.
 */
export function commandsAfterReconnect(_staged: readonly StagedCommand[]): string[] {
  return []
}

let reconnectEpoch = 0
const staged: StagedCommand[] = []

export function noteStagedCommand(command: StagedCommand): void {
  staged.push(command)
  if (staged.length > 20) staged.splice(0, staged.length - 20)
}

export function currentReconnectEpoch(): number {
  return reconnectEpoch
}

/** Drop everything staged and bump the epoch so an in-flight confirm cannot write. */
export function discardOnReconnect(): string[] {
  const snapshot = staged.splice(0, staged.length)
  reconnectEpoch += 1
  return commandsAfterReconnect(snapshot)
}

export function clearStagedCommands(): void {
  staged.splice(0, staged.length)
}
