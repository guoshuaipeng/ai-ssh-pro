/** L7b: ops-home summary sampling. Probes are not work sessions and never open a tab. */
import { parseResourceSnapshot } from './resource-monitor'

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
  /** L7d extras. All off restores CPU / mem / disk only. */
  extraLoad: boolean
  extraInode: boolean
  extraMounts: boolean
  mounts: string[]
}

export const DEFAULT_PROBE_PREFS: ProbePrefs = {
  enabled: true,
  scope: 'group',
  maxConcurrent: PROBE_DEFAULT_MAX,
  filterTags: false,
  tags: [],
  prodOnly: false,
  excludeReadonly: true,
  backoffCapMin: PROBE_BACKOFF_CAP_MIN,
  extraLoad: false,
  extraInode: false,
  extraMounts: false,
  mounts: ['/']
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
    backoffCapMin: clampBackoffCap(raw?.backoffCapMin),
    extraLoad: raw?.extraLoad === true,
    extraInode: raw?.extraInode === true,
    extraMounts: raw?.extraMounts === true,
    mounts: normalizeMounts(raw?.mounts)
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
  load?: [number, number, number] | null
  inode?: number | null
  mounts?: ProbeMount[]
}

export const PROBE_MOUNT_MAX = 5

export type ProbeMount = { path: string; percent: number | null; missing?: boolean }

export type ProbeExtras = { load: boolean; inode: boolean; mounts: string[] }

const MOUNT_PATH = /^\/(?!.*\.\.)[A-Za-z0-9._\-/]*$/

export function normalizeMounts(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : ['/']
  const out: string[] = []
  for (const item of list) {
    const path = normalizeMountPath(typeof item === 'string' ? item : '')
    if (!path || out.includes(path)) continue
    out.push(path)
    if (out.length >= PROBE_MOUNT_MAX) break
  }
  return out.length ? out : ['/']
}

export function normalizeMountPath(raw: string): string | null {
  const path = String(raw ?? '').trim()
  if (!MOUNT_PATH.test(path)) return null
  return path
}

export function probeExtrasOf(prefs: Pick<ProbePrefs, 'extraLoad' | 'extraInode' | 'extraMounts' | 'mounts'>): ProbeExtras {
  return {
    load: prefs.extraLoad === true,
    inode: prefs.extraInode === true,
    mounts: prefs.extraMounts === true ? normalizeMounts(prefs.mounts) : []
  }
}

/** Sections the probe will ask the host for. Unchecked extras are absent. */
export function probeSections(extras: ProbeExtras): string[] {
  const sections = ['cpu', 'mem', 'disk']
  if (extras.load) sections.push('load')
  if (extras.inode) sections.push('inode')
  if (extras.mounts.length) sections.push('mounts')
  return sections
}

export function buildProbeCommand(extras: ProbeExtras): string {
  const parts = [
    'LC_ALL=C',
    'nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo',
    "echo '@@'",
    'head -n1 /proc/stat; sleep 0.5; head -n1 /proc/stat',
    "echo '@@'",
    'free -b',
    "echo '@@'",
    "df -kP -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null | head -n 30"
  ]
  if (extras.load) parts.push("echo '@@LOAD@@'", 'cat /proc/loadavg')
  if (extras.inode) parts.push("echo '@@INODE@@'", "df -iP -x tmpfs -x devtmpfs -x overlay -x squashfs 2>/dev/null | head -n 30")
  if (extras.mounts.length) {
    const paths = extras.mounts.map((p) => `'${p.replace(/'/g, '')}'`).join(' ')
    parts.push("echo '@@MOUNTS@@'", `df -kP ${paths} 2>/dev/null | head -n 20`)
  }
  return parts.join('; ')
}

export type ParsedProbe = {
  cpu: number | null
  mem: number | null
  disk: number | null
  load?: [number, number, number] | null
  inode?: number | null
  mounts?: ProbeMount[]
}

function diskPercent(disks: Array<{ mount: string; percent: number }>): number | null {
  if (!disks.length) return null
  return Math.max(...disks.map((d) => d.percent))
}

function marked(stdout: string, mark: string): string {
  const i = stdout.indexOf(mark)
  if (i < 0) return ''
  const rest = stdout.slice(i + mark.length)
  const next = rest.search(/@@(?:LOAD|INODE|MOUNTS)@@/)
  return (next < 0 ? rest : rest.slice(0, next)).trim()
}

export function parseProbeOutput(stdout: string, extras: ProbeExtras): ParsedProbe {
  const text = String(stdout ?? '')
  let end = text.length
  for (const mark of ['@@LOAD@@', '@@INODE@@', '@@MOUNTS@@']) {
    const i = text.indexOf(mark)
    if (i >= 0 && i < end) end = i
  }
  const snap = parseResourceSnapshot(`0 0 0\n@@\n${text.slice(0, end)}\n@@\n`)
  const parsed: ParsedProbe = {
    cpu: snap.cpuPercent,
    mem: snap.mem?.percent ?? null,
    disk: diskPercent(snap.disks)
  }
  if (extras.load) {
    const la = marked(text, '@@LOAD@@').split(/\s+/).slice(0, 3).map(Number)
    parsed.load = la.length === 3 && la.every((n) => Number.isFinite(n)) ? [la[0]!, la[1]!, la[2]!] : null
  }
  if (extras.inode) parsed.inode = parseInodePercent(marked(text, '@@INODE@@'))
  if (extras.mounts.length) parsed.mounts = matchMounts(marked(text, '@@MOUNTS@@'), extras.mounts)
  return parsed
}

function parseInodePercent(text: string): number | null {
  let root: number | null = null
  let max = -1
  for (const line of text.split('\n').slice(1)) {
    const p = line.trim().split(/\s+/)
    if (p.length < 6) continue
    const pct = parseInt(String(p[4]).replace('%', ''), 10)
    if (!Number.isFinite(pct)) continue
    const mount = p.slice(5).join(' ')
    if (pct > max) max = pct
    if (mount === '/') root = pct
  }
  if (root != null) return root
  return max >= 0 ? max : null
}

export function matchMounts(dfText: string, wanted: string[]): ProbeMount[] {
  const found = new Map<string, number>()
  for (const line of dfText.split('\n').slice(1)) {
    const p = line.trim().split(/\s+/)
    if (p.length < 6) continue
    const pct = parseInt(String(p[4]).replace('%', ''), 10)
    if (!Number.isFinite(pct)) continue
    found.set(p.slice(5).join(' '), pct)
  }
  return wanted.map((path) => {
    if (!found.has(path)) return { path, percent: null, missing: true }
    return { path, percent: found.get(path)! }
  })
}

export function demoExtras(profileId: string, extras: ProbeExtras): Pick<ParsedProbe, 'load' | 'inode' | 'mounts'> {
  let n = 0
  for (let i = 0; i < profileId.length; i++) n = (n * 33 + profileId.charCodeAt(i)) >>> 0
  const out: Pick<ParsedProbe, 'load' | 'inode' | 'mounts'> = {}
  if (extras.load) {
    const a = ((n % 80) / 100)
    out.load = [a, Math.round((a * 0.9) * 100) / 100, Math.round((a * 0.8) * 100) / 100]
  }
  if (extras.inode) out.inode = 10 + (n % 80)
  if (extras.mounts.length) {
    out.mounts = extras.mounts.map((path, i) => {
      if (path.includes('missing')) return { path, percent: null, missing: true }
      return { path, percent: 15 + ((n + i * 17) % 70) }
    })
  }
  return out
}
