import { matchProfile, parseQuickTarget, type QuickTarget } from './quick-connect'
import type { RecentConnection } from './workspace-features'

/**
 * D13c: a quick-connect row in Recent reconnects the same way it was opened (user, port, -i path, -J hops).
 * Saved-host rows return null so the caller keeps the saved-profile path.
 */
export function recentQuickTarget(row: Pick<RecentConnection, 'host' | 'port' | 'username' | 'quick' | 'identity' | 'jump'>): QuickTarget | null {
  if (!row.quick || !row.host || !row.username) return null
  const t: QuickTarget = { host: row.host, port: row.port || 22, username: row.username }
  if (row.identity) t.identity = row.identity
  if (row.jump?.length) t.jump = row.jump.map((h) => ({ host: h.host, port: h.port || 22, ...(h.username ? { username: h.username } : {}) }))
  return t
}

export type SidebarQuick<P> = { target: QuickTarget; saved: P | null }

/** D13c: sidebar search text that is an address (`user@host[:port]`, `host:port`, IP, or an `ssh …` command). */
export function sidebarQuick<P extends { host: string; port?: number; username?: string }>(query: string, profiles: P[]): SidebarQuick<P> | null {
  const q = String(query ?? '').trim()
  if (q.length < 3) return null
  const target = parseQuickTarget(q)
  if (!target) return null
  return { target, saved: matchProfile(profiles, target) }
}

type RecentLike = Pick<RecentConnection, 'host' | 'port' | 'username' | 'label' | 'jump'>

/** D21: filter Recent by user / host / port / label / jump host (case-insensitive, all words must match). */
export function filterRecent<T extends RecentLike>(rows: T[], query: string): T[] {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return rows
  return rows.filter((r) => {
    const hay = [`${r.username}@${r.host}:${r.port || 22}`, r.label ?? '', ...(r.jump ?? []).map((h) => h.host)].join(' ').toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** D21: what "Save as host" pre-fills (never a secret: the key is a path). */
export function recentSaveTarget(row: Pick<RecentConnection, 'host' | 'port' | 'username' | 'label' | 'quick' | 'identity' | 'jump'>): { target: QuickTarget; label: string } {
  const target = recentQuickTarget({ ...row, quick: true }) ?? { host: row.host, port: row.port || 22, username: row.username }
  return { target, label: row.label?.trim() || '' }
}
