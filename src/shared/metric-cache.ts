/**
 * M17: last-known host metrics. Host system metrics never show a loading state —
 * cards render the cached values at once (with a muted "上次 · N 分钟前" hint) and
 * swap in live data silently when a sample lands. No cache → calm "—".
 */
export type CachedMetrics = {
  cpu: number | null
  mem: number | null
  disk: number | null
  load?: [number, number, number] | null
  /** Epoch ms of the sample. */
  at: number
}

export const METRIC_CACHE_KEY = 'aiss.metricCache.v1'
/** Keep the newest N hosts; older entries are pruned on write. */
export const METRIC_CACHE_MAX = 200
/** Younger than this counts as live (no stale hint). */
export const METRIC_FRESH_MS = 60_000

type Store = Pick<Storage, 'getItem' | 'setItem'>

function storeOf(store?: Store): Store | null {
  if (store) return store
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Stable host key: the saved profile id when there is one, else user@host:port. */
export function metricHostKey(h: { profileId?: string | null; host?: string; port?: number; username?: string }): string {
  if (h.profileId) return h.profileId
  return `${h.username ?? ''}@${h.host ?? ''}:${h.port ?? 22}`
}

export function loadMetricCache(store?: Store): Record<string, CachedMetrics> {
  const s = storeOf(store)
  if (!s) return {}
  try {
    const raw = s.getItem(METRIC_CACHE_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw) as Record<string, Partial<CachedMetrics>>
    const out: Record<string, CachedMetrics> = {}
    for (const [id, m] of Object.entries(o ?? {})) {
      const at = num(m?.at)
      if (!at) continue
      const load = Array.isArray(m.load) && m.load.length === 3 && m.load.every((x) => num(x) != null) ? (m.load as [number, number, number]) : null
      out[id] = { cpu: num(m.cpu), mem: num(m.mem), disk: num(m.disk), load, at }
    }
    return out
  } catch {
    return {}
  }
}

export function readCachedMetrics(id: string, store?: Store): CachedMetrics | null {
  return loadMetricCache(store)[id] ?? null
}

/** Persist a sample. All-null samples are ignored so a failed read never wipes good numbers. */
export function writeCachedMetrics(
  id: string,
  m: { cpu: number | null; mem: number | null; disk: number | null; load?: [number, number, number] | null; at?: number | null },
  store?: Store
): CachedMetrics | null {
  const s = storeOf(store)
  if (!s || !id) return null
  if (num(m.cpu) == null && num(m.mem) == null && num(m.disk) == null) return null
  const entry: CachedMetrics = { cpu: num(m.cpu), mem: num(m.mem), disk: num(m.disk), load: m.load ?? null, at: num(m.at) ?? Date.now() }
  const all = loadMetricCache(s)
  const prev = all[id]
  if (prev && prev.at > entry.at) return prev
  all[id] = entry
  const ids = Object.keys(all)
  if (ids.length > METRIC_CACHE_MAX) {
    ids.sort((a, b) => all[a].at - all[b].at)
    for (const old of ids.slice(0, ids.length - METRIC_CACHE_MAX)) delete all[old]
  }
  try {
    s.setItem(METRIC_CACHE_KEY, JSON.stringify(all))
  } catch {
    /* quota: keep the in-memory view */
  }
  return entry
}

export type StaleAge = { key: 'just' | 'min' | 'hour' | 'day'; n: number }

/** Age bucket for the stale hint ("上次 · 刚刚 / N 分钟前 / N 小时前 / N 天前"). */
export function staleAge(at: number, now: number): StaleAge {
  const sec = Math.max(0, now - at) / 1000
  if (sec < 60) return { key: 'just', n: 0 }
  if (sec < 3600) return { key: 'min', n: Math.floor(sec / 60) }
  if (sec < 86400) return { key: 'hour', n: Math.floor(sec / 3600) }
  return { key: 'day', n: Math.floor(sec / 86400) }
}

/** i18n key for a stale hint. */
export function staleHintKey(age: StaleAge): 'mc.staleJust' | 'mc.staleMin' | 'mc.staleHour' | 'mc.staleDay' {
  return age.key === 'just' ? 'mc.staleJust' : age.key === 'min' ? 'mc.staleMin' : age.key === 'hour' ? 'mc.staleHour' : 'mc.staleDay'
}

export type MetricView = {
  cpu: number | null
  mem: number | null
  disk: number | null
  load?: [number, number, number] | null
  /** Set when the numbers come from the cache (render the muted stale hint). */
  staleAt: number | null
  /** false only when there is neither a live sample nor a cache entry. */
  known: boolean
}

/** Live first, cache second, "—" last. Never a loading state. */
export function pickMetrics(
  live: { cpu: number | null; mem: number | null; disk: number | null; load?: [number, number, number] | null } | null | undefined,
  cached: CachedMetrics | null | undefined
): MetricView {
  if (live && (live.cpu != null || live.mem != null || live.disk != null)) {
    return { cpu: live.cpu, mem: live.mem, disk: live.disk, load: live.load ?? null, staleAt: null, known: true }
  }
  if (cached) return { cpu: cached.cpu, mem: cached.mem, disk: cached.disk, load: cached.load ?? null, staleAt: cached.at, known: true }
  return { cpu: null, mem: null, disk: null, load: null, staleAt: null, known: false }
}
