/** L7b: ops-home summary sampling. Probes are not work sessions and never open a tab. */

export const HEALTH_PROBE_KIND = 'health-probe'

export const PROBE_PREFS_KEY = 'aiss.prefs.opsHome.probe'
export const PROBE_DEFAULT_MAX = 8
export const PROBE_HARD_MAX = 30
export const PROBE_INTERVAL_MS = 30_000
/** L7c failure ladder: 30s, 60s, 2m, then the cap (default 5 min). */
export const PROBE_BACKOFF_MS = [30_000, 60_000, 120_000] as const
export const PROBE_BACKOFF_CAP_MIN = 5
export const PROBE_RETRY_ALL_COOLDOWN_MS = 10_000
export const PROBE_IDLE_HIDDEN_MS = 30_000
export const PROBE_IDLE_VISIBLE_MS = 3 * 60_000

export type ProbeScopeMode = 'group' | 'recent' | 'all'

export type ProbePrefs = {
  enabled: boolean
  scope: ProbeScopeMode
  maxConcurrent: number
  filterTags: boolean
  tags: string[]
  prodOnly: boolean
  excludeReadonly: boolean
  backoffCapMin: number
}

export const DEFAULT_PROBE_PREFS: ProbePrefs = {
  enabled: true,
  scope: 'group',
  maxConcurrent: PROBE_DEFAULT_MAX,
  filterTags: false,
  tags: [],
  prodOnly: false,
  excludeReadonly: true,
  backoffCapMin: PROBE_BACKOFF_CAP_MIN
}

export type ProbeCandidate = {
  profileId: string
  folderId?: string
  alerting: boolean
  order: number
  recent?: boolean
  pinned?: boolean
  tags?: string[]
  protection?: 'normal' | 'production' | 'readonly'
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function clampProbeMax(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return PROBE_DEFAULT_MAX
  return Math.max(1, Math.min(PROBE_HARD_MAX, Math.round(n)))
}

export function clampBackoffCap(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return PROBE_BACKOFF_CAP_MIN
  return Math.max(1, Math.min(30, Math.round(n)))
}

export function normalizeProbePrefs(raw: Partial<ProbePrefs> | null | undefined): ProbePrefs {
  const scope: ProbeScopeMode = raw?.scope === 'recent' || raw?.scope === 'all' || raw?.scope === 'group' ? raw.scope : 'group'
  const tags = Array.isArray(raw?.tags) ? raw.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : []
  return {
    enabled: raw?.enabled !== false,
    scope,
    maxConcurrent: clampProbeMax(raw?.maxConcurrent),
    filterTags: raw?.filterTags === true,
    tags,
    prodOnly: raw?.prodOnly === true,
    excludeReadonly: raw?.excludeReadonly !== false,
    backoffCapMin: clampBackoffCap(raw?.backoffCapMin)
  }
}

export function probeFiltersActive(prefs: ProbePrefs): boolean {
  return Boolean(prefs.prodOnly || prefs.excludeReadonly || (prefs.filterTags && prefs.tags.length > 0))
}

/** L7b scope first, then tag / protection filters. All filters off returns the L7b pool. */
export function applyProbeFilters(pool: ProbeCandidate[], prefs: ProbePrefs): ProbeCandidate[] {
  let out = pool
  if (prefs.prodOnly) out = out.filter((h) => h.protection === 'production')
  else if (prefs.excludeReadonly) out = out.filter((h) => h.protection !== 'readonly')
  if (prefs.filterTags && prefs.tags.length) {
    const want = new Set(prefs.tags)
    out = out.filter((h) => (h.tags ?? []).some((tag) => want.has(tag)))
  }
  return out
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
  return sortCandidates(applyProbeFilters(pool, prefs), now, backoffUntil).slice(0, limit)
}

export function nextBackoffMs(failures: number, capMin = PROBE_BACKOFF_CAP_MIN): number {
  const cap = clampBackoffCap(capMin) * 60_000
  if (failures <= 1) return PROBE_BACKOFF_MS[0]
  if (failures === 2) return PROBE_BACKOFF_MS[1]
  if (failures === 3) return PROBE_BACKOFF_MS[2]
  return cap
}

export function retryAllAllowed(lastAt: number | null | undefined, now: number, cool = PROBE_RETRY_ALL_COOLDOWN_MS): boolean {
  return lastAt == null || now - lastAt >= cool
}

/** Retry-all touches the failed set only. */
export function idsToRetry(failedIds: readonly string[], allIds: readonly string[]): string[] {
  const failed = new Set(failedIds)
  return allIds.filter((id) => failed.has(id))
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
