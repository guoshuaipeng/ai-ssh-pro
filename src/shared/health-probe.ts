/** L7b: ops-home summary sampling. Probes are not work sessions and never open a tab. */

export const HEALTH_PROBE_KIND = 'health-probe'

export const PROBE_PREFS_KEY = 'aiss.prefs.opsHome.probe'
export const PROBE_DEFAULT_MAX = 8
export const PROBE_HARD_MAX = 30
export const PROBE_INTERVAL_MS = 30_000
export const PROBE_BACKOFF_MS = [15_000, 30_000, 60_000] as const
export const PROBE_IDLE_HIDDEN_MS = 30_000
export const PROBE_IDLE_VISIBLE_MS = 3 * 60_000

export type ProbeScopeMode = 'group' | 'recent' | 'all'

export type ProbePrefs = {
  enabled: boolean
  scope: ProbeScopeMode
  maxConcurrent: number
}

export const DEFAULT_PROBE_PREFS: ProbePrefs = {
  enabled: true,
  scope: 'group',
  maxConcurrent: PROBE_DEFAULT_MAX
}

export type ProbeCandidate = {
  profileId: string
  folderId?: string
  alerting: boolean
  order: number
  recent?: boolean
  pinned?: boolean
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function clampProbeMax(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return PROBE_DEFAULT_MAX
  return Math.max(1, Math.min(PROBE_HARD_MAX, Math.round(n)))
}

export function normalizeProbePrefs(raw: Partial<ProbePrefs> | null | undefined): ProbePrefs {
  const scope: ProbeScopeMode = raw?.scope === 'recent' || raw?.scope === 'all' || raw?.scope === 'group' ? raw.scope : 'group'
  return {
    enabled: raw?.enabled !== false,
    scope,
    maxConcurrent: clampProbeMax(raw?.maxConcurrent)
  }
}

export function loadProbePrefs(store: Pick<Storage, 'getItem'> = globalThis.localStorage): ProbePrefs {
  try {
    const raw = store.getItem(PROBE_PREFS_KEY)
    if (!raw) return { ...DEFAULT_PROBE_PREFS }
    return normalizeProbePrefs(JSON.parse(raw) as Partial<ProbePrefs>)
  } catch {
    return { ...DEFAULT_PROBE_PREFS }
  }
}

export function saveProbePrefs(prefs: ProbePrefs, store: Store = globalThis.localStorage): void {
  const next = normalizeProbePrefs(prefs)
  store.setItem(PROBE_PREFS_KEY, JSON.stringify(next))
}

function sortCandidates(pool: ProbeCandidate[], now: number, backoffUntil: Record<string, number>): ProbeCandidate[] {
  return [...pool].sort((a, b) => {
    const alert = Number(b.alerting) - Number(a.alerting)
    if (alert) return alert
    const ab = (backoffUntil[a.profileId] ?? 0) > now ? 1 : 0
    const bb = (backoffUntil[b.profileId] ?? 0) > now ? 1 : 0
    if (ab !== bb) return ab - bb
    return a.order - b.order
  })
}

/**
 * Who to sample. Never the whole inventory: a group is capped at 30,
 * and "no group" falls back to recent ∪ pinned or the first N hosts.
 */
export function selectProbeTargets(
  hosts: ProbeCandidate[],
  prefs: ProbePrefs,
  opts: { grouped?: boolean; now?: number; backoffUntil?: Record<string, number> } = {}
): ProbeCandidate[] {
  const now = opts.now ?? Date.now()
  const backoffUntil = opts.backoffUntil ?? {}
  const max = clampProbeMax(prefs.maxConcurrent)
  const recent = hosts.filter((h) => h.recent || h.pinned)
  let pool: ProbeCandidate[]
  let limit: number
  if (prefs.scope === 'all') {
    pool = hosts
    limit = max
  } else if (prefs.scope === 'recent') {
    pool = recent
    limit = PROBE_HARD_MAX
  } else if (opts.grouped) {
    pool = hosts
    limit = PROBE_HARD_MAX
  } else if (recent.length) {
    pool = recent
    limit = PROBE_HARD_MAX
  } else {
    pool = hosts
    limit = max
  }
  return sortCandidates(pool, now, backoffUntil).slice(0, limit)
}

export function nextBackoffMs(failures: number): number {
  if (failures <= 1) return PROBE_BACKOFF_MS[0]
  if (failures === 2) return PROBE_BACKOFF_MS[1]
  return PROBE_BACKOFF_MS[2]
}

/** FIFO wave: in-flight probes stay; only idle due hosts start, up to the cap. */
export function planProbeWave(dueIds: string[], runningCount: number, maxConcurrent: number): { start: string[]; queued: string[] } {
  const room = Math.max(0, clampProbeMax(maxConcurrent) - Math.max(0, runningCount))
  return { start: dueIds.slice(0, room), queued: dueIds.slice(room) }
}

const SECRET = /(?:password|passwd|passphrase|private[_-]?key|secret|token)\s*[=:]\s*\S+/gi
const PEM = /-----BEGIN[\s\S]*?-----END [^-]+-----/g

/** User-visible failure text. Drops key material and credential assignments. */
export function sanitizeProbeReason(raw: string): string {
  return String(raw ?? '')
    .replace(PEM, '[redacted]')
    .replace(SECRET, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

export type ProbeFailureCode = 'key' | 'auth' | 'timeout' | 'busy' | 'other'

export function classifyProbeFailure(message: string): ProbeFailureCode {
  const m = message.toLowerCase()
  if (m.includes('密钥') || m.includes('host key') || m.includes('untrusted') || m.includes('verification failed')) return 'key'
  if (m.includes('timeout') || m.includes('timed out') || m.includes('超时') || m.includes('etimedout')) return 'timeout'
  if (m.includes('auth') || m.includes('认证') || m.includes('permission denied')) return 'auth'
  return 'other'
}

/** Stable demo bars so the home can render without SSH. */
export function demoHealthMetrics(profileId: string): { cpu: number; mem: number; disk: number } {
  let n = 0
  for (let i = 0; i < profileId.length; i++) n = (n * 33 + profileId.charCodeAt(i)) >>> 0
  return { cpu: 20 + (n % 55), mem: 25 + ((n >>> 8) % 50), disk: 10 + ((n >>> 16) % 70) }
}

export function allowProbeToast(lastAt: number | undefined, now: number, windowMs = 60_000): boolean {
  return lastAt == null || now - lastAt >= windowMs
}

export type HealthProbeResult = {
  profileId: string
  ok: boolean
  cpu: number | null
  mem: number | null
  disk: number | null
  latencyMs: number | null
  at: number
  via: 'session' | 'probe' | 'demo' | 'none'
  kind: typeof HEALTH_PROBE_KIND
  error?: string
  code?: ProbeFailureCode
}
