/**
 * L10: connect a sidebar selection or a whole group.
 * One session tab per host, a small parallel cap so the tab strip stays usable,
 * and a failure on one host does not cancel the rest.
 * This module only schedules connect callbacks. It does not send shell commands.
 */

export const BATCH_CONNECT_LIMIT = 4
export const BATCH_CONNECT_LIMIT_MAX = 5

export type BatchHost = {
  id: string
  label: string
  folderId?: string
}

export type BatchTabSnap = {
  tabId: string
  profileId?: string
  status: string
  view?: string
  kind?: string
  sessionId?: string
}

export type BatchConnectValue = {
  ok: boolean
  error?: string
  reused?: boolean
  /** User closed the tab before the attempt finished. */
  skipped?: boolean
}

export type BatchConnectResult = {
  id: string
  label: string
  ok: boolean
  error?: string
  reused?: boolean
  skipped?: boolean
  /** L10-4: never handed to connect(). In-flight hosts are not marked cancelled. */
  cancelled?: boolean
}

export type BatchConnectProgress = {
  total: number
  started: number
  queued: number
  cancelled: number
}

export type BatchRunControl = {
  /** When true, hosts that have not started connecting are dropped. In-flight calls keep running. */
  isCancelled?: () => boolean
  onProgress?: (progress: BatchConnectProgress) => void
}

export function clampBatchLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return BATCH_CONNECT_LIMIT
  const n = Math.floor(limit)
  if (n < 1) return 1
  if (n > BATCH_CONNECT_LIMIT_MAX) return BATCH_CONNECT_LIMIT_MAX
  return n
}

export function hostsByIds<T extends BatchHost>(profiles: readonly T[], ids: readonly string[]): BatchHost[] {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const seen = new Set<string>()
  const out: BatchHost[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    const row = byId.get(id)
    if (!row) continue
    seen.add(id)
    out.push({ id: row.id, label: row.label, folderId: row.folderId })
  }
  return out
}

export function hostsInFolder<T extends BatchHost>(profiles: readonly T[], folderId: string): BatchHost[] {
  const seen = new Set<string>()
  const out: BatchHost[] = []
  for (const row of profiles) {
    if (row.folderId !== folderId || seen.has(row.id)) continue
    seen.add(row.id)
    out.push({ id: row.id, label: row.label, folderId: row.folderId })
  }
  out.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'))
  return out
}

export function planPaletteGroup<T extends BatchHost>(
  profiles: readonly T[],
  highlightedId?: string | null
): { ok: true; hosts: BatchHost[] } | { ok: false; reason: 'ungrouped' | 'empty-group' } {
  const current = highlightedId ? profiles.find((p) => p.id === highlightedId) : undefined
  if (!current?.folderId) return { ok: false, reason: 'ungrouped' }
  const hosts = hostsInFolder(profiles, current.folderId)
  if (!hosts.length) return { ok: false, reason: 'empty-group' }
  return { ok: true, hosts }
}

function isSessionTab(tab: BatchTabSnap, profileId: string): boolean {
  return tab.profileId === profileId && (!tab.view || tab.view === 'session') && tab.kind !== 'local'
}

/** reuse = already up or in flight; reconnect = one existing dead tab; open = a new tab. */
export function pickBatchTarget(tabs: readonly BatchTabSnap[], profileId: string): 'reuse' | 'reconnect' | 'open' {
  const rows = tabs.filter((tab) => isSessionTab(tab, profileId))
  if (rows.some((tab) => tab.status === 'connected' && tab.sessionId)) return 'reuse'
  if (rows.some((tab) => tab.status === 'connecting')) return 'reuse'
  if (rows.some((tab) => tab.status === 'disconnected')) return 'reconnect'
  return 'open'
}

export function focusTabId(tabs: readonly BatchTabSnap[], profileId: string): string | null {
  const rows = tabs.filter((tab) => isSessionTab(tab, profileId))
  return (
    rows.find((tab) => tab.status === 'connected' && tab.sessionId)?.tabId ??
    rows.find((tab) => tab.status === 'connecting')?.tabId ??
    rows.find((tab) => tab.status === 'disconnected')?.tabId ??
    null
  )
}

export function reconnectTabId(tabs: readonly BatchTabSnap[], profileId: string): string | null {
  const row = tabs.find((tab) => isSessionTab(tab, profileId) && tab.status === 'disconnected')
  return row?.tabId ?? null
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return String(err ?? 'failed')
}

function settle(host: { id: string; label: string }, value: BatchConnectValue | undefined, thrown?: unknown): BatchConnectResult {
  if (thrown !== undefined) return { id: host.id, label: host.label, ok: false, error: messageOf(thrown) }
  if (value?.skipped) return { id: host.id, label: host.label, ok: true, skipped: true }
  if (!value || value.ok !== true) return { id: host.id, label: host.label, ok: false, error: value?.error || 'failed' }
  return { id: host.id, label: host.label, ok: true, reused: value.reused }
}

function cancelledRow(host: { id: string; label: string }): BatchConnectResult {
  return { id: host.id, label: host.label, ok: true, skipped: true, cancelled: true }
}

/**
 * Run `connect` for every host. At most `limit` calls are in flight (clamped to 1–5).
 * A rejection is recorded on that host and the queue keeps going.
 * If `control.isCancelled()` is set, hosts that have not been passed to `connect` are
 * marked cancelled and are not started. Calls already in flight are left to finish.
 * Results stay in input order.
 */
export async function runBatchConnect<T extends { id: string; label: string }>(
  hosts: readonly T[],
  limit: number | undefined,
  connect: (host: T) => Promise<BatchConnectValue>,
  control?: BatchRunControl
): Promise<BatchConnectResult[]> {
  if (!hosts.length) return []
  const cap = clampBatchLimit(limit)
  const results = new Array<BatchConnectResult>(hosts.length)
  let next = 0
  let inflight = 0
  let startedCount = 0
  let cancelledCount = 0
  const report = () => {
    control?.onProgress?.({
      total: hosts.length,
      started: startedCount,
      queued: Math.max(0, hosts.length - startedCount - cancelledCount),
      cancelled: cancelledCount
    })
  }
  const dropQueued = () => {
    if (!control?.isCancelled?.()) return
    while (next < hosts.length) {
      const host = hosts[next]!
      results[next] = cancelledRow(host)
      next += 1
      cancelledCount += 1
    }
  }
  await new Promise<void>((resolve) => {
    const pump = () => {
      dropQueued()
      if (next >= hosts.length && inflight === 0) {
        report()
        resolve()
        return
      }
      while (inflight < cap && next < hosts.length && !control?.isCancelled?.()) {
        const index = next
        next += 1
        const host = hosts[index]!
        inflight += 1
        startedCount += 1
        let pending: Promise<BatchConnectValue>
        try {
          pending = Promise.resolve(connect(host))
        } catch (err) {
          pending = Promise.reject(err)
        }
        pending.then(
          (value) => {
            results[index] = settle(host, value)
          },
          (err) => {
            results[index] = settle(host, undefined, err)
          }
        ).finally(() => {
          inflight -= 1
          pump()
        })
      }
      dropQueued()
      report()
      if (next >= hosts.length && inflight === 0) resolve()
    }
    pump()
  })
  return results
}

export function summarizeBatch(results: readonly BatchConnectResult[]): {
  ok: number
  fail: number
  failed: BatchConnectResult[]
  cancelled: number
} {
  const failed = results.filter((row) => !row.ok)
  const ok = results.filter((row) => row.ok && !row.skipped && !row.cancelled).length
  const cancelled = results.filter((row) => row.cancelled).length
  return { ok, fail: failed.length, failed, cancelled }
}

/** Keep a single host-key dialog. Later prompts wait instead of replacing the one on screen. */
export function enqueueHostKey<T>(current: T | null, queue: readonly T[], next: T): { current: T | null; queue: T[] } {
  if (!current) return { current: next, queue: [...queue] }
  return { current, queue: [...queue, next] }
}

export function advanceHostKey<T>(queue: readonly T[]): { current: T | null; queue: T[] } {
  if (!queue.length) return { current: null, queue: [] }
  const [current, ...rest] = queue
  return { current: current ?? null, queue: rest }
}
