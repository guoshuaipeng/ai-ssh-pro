/** UX-18: recent connections collapse by default and do not duplicate the host tree. */

export const RECENT_EXPANDED_KEY = 'aiss.sidebar.recentExpanded'

export type RecentRow = {
  id: string
  host: string
  port?: number
  username: string
  label?: string
  pinned?: boolean
  lastConnectedAt?: number
}

export function loadRecentExpanded(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  return store.getItem(RECENT_EXPANDED_KEY) === '1'
}

export function saveRecentExpanded(open: boolean, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(RECENT_EXPANDED_KEY, open ? '1' : '0')
}

export function recentIdentity(row: Pick<RecentRow, 'host' | 'port' | 'username'>): string {
  return `${row.username.toLowerCase()}@${row.host.toLowerCase()}:${row.port || 22}`
}

/** One row per host+port+user. Pinned rows (max 3) stay on top. Display cap is 5. */
export function dedupeRecent<T extends RecentRow>(rows: T[], limit = 5, pinLimit = 3): T[] {
  const sorted = [...rows].sort((a, b) => (b.lastConnectedAt || 0) - (a.lastConnectedAt || 0))
  const seen = new Set<string>()
  const unique: T[] = []
  for (const row of sorted) {
    const key = recentIdentity(row)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }
  const pinned = unique.filter((r) => r.pinned).slice(0, pinLimit)
  const pinnedIds = new Set(pinned.map((r) => r.id))
  const rest = unique.filter((r) => !pinnedIds.has(r.id))
  return [...pinned, ...rest].slice(0, limit)
}

export type RelativeWhen = { kind: 'now' } | { kind: 'min'; n: number } | { kind: 'hour'; n: number } | { kind: 'yesterday' } | { kind: 'date' }

export function relativeWhen(ts: number, now = Date.now()): RelativeWhen {
  if (!ts) return { kind: 'date' }
  const delta = Math.max(0, now - ts)
  if (delta < 60_000) return { kind: 'now' }
  if (delta < 3_600_000) return { kind: 'min', n: Math.floor(delta / 60_000) }
  if (delta < 86_400_000) return { kind: 'hour', n: Math.floor(delta / 3_600_000) }
  const a = new Date(now)
  const b = new Date(ts)
  const startToday = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const startYesterday = startToday - 86_400_000
  if (b.getTime() >= startYesterday && b.getTime() < startToday) return { kind: 'yesterday' }
  return { kind: 'date' }
}
