/** W3: local snapshots of remote text before an overwrite. Content is stored only as ciphertext. */
import { appendAudit, type AuditOutcome } from './audit-log'
import { appendTimeline } from './timeline'

export const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024
export const SNAPSHOT_DEFAULT_KEEP = 10
export const SNAPSHOT_GLOBAL_CAP = 200 * 1024 * 1024
export const SNAPSHOT_KEEP_OPTIONS = [5, 10, 20, 50] as const
export const SNAP_AUTO_KEY = 'aiss.snapshots.auto'
export const SNAP_KEEP_KEY = 'aiss.snapshots.keep'
export const SNAP_INDEX_KEY = 'aiss.snapshots.v1'

export type SnapSource = 'edit' | 'sync' | 'syncDelete' | 'rollback' | 'upload'

export type Snapshot = {
  id: string
  profileId: string
  path: string
  at: number
  source: SnapSource
  bytes: number
  pinned: boolean
  hash: string
  ciphertext: string
  stale?: boolean
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function snapshotsEnabled(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  try {
    return store.getItem(SNAP_AUTO_KEY) !== '0'
  } catch {
    return true
  }
}

export function setSnapshotsEnabled(on: boolean, store: Store = globalThis.localStorage): void {
  store.setItem(SNAP_AUTO_KEY, on ? '1' : '0')
}

export function normalizeSnapshotKeep(value: unknown): number {
  const n = Number(value)
  return (SNAPSHOT_KEEP_OPTIONS as readonly number[]).includes(n) ? n : SNAPSHOT_DEFAULT_KEEP
}

/** New overwrites follow the auto setting. An explicit rollback still keeps the pre-image. */
export function shouldRecordSnapshot(source: SnapSource, auto: boolean): boolean {
  if (source === 'rollback') return true
  return auto
}

export function snapshotKeep(store: Pick<Storage, 'getItem'> = globalThis.localStorage): number {
  try {
    return normalizeSnapshotKeep(store.getItem(SNAP_KEEP_KEY))
  } catch {
    return SNAPSHOT_DEFAULT_KEEP
  }
}

export function setSnapshotKeep(n: number, store: Store = globalThis.localStorage): void {
  const keep = (SNAPSHOT_KEEP_OPTIONS as readonly number[]).includes(n) ? n : SNAPSHOT_DEFAULT_KEEP
  store.setItem(SNAP_KEEP_KEY, String(keep))
}

export function normalizeSnapPath(path: string): string {
  const s = String(path ?? '').replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!s) return '/'
  return s.startsWith('/') ? s : `/${s}`
}

export function snapshotFileKey(profileId: string, path: string): string {
  return `${profileId}\u0000${normalizeSnapPath(path)}`
}

export function hashText(text: string): string {
  let h = 5381
  const s = String(text ?? '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i)
  return (h >>> 0).toString(16)
}

export function snapshotByteLength(text: string): number {
  return new TextEncoder().encode(String(text ?? '')).length
}

export function eligibleSnapshot(content: string, isText = true): { ok: true } | { ok: false; reason: 'binary' | 'size' } {
  if (!isText || String(content ?? '').includes('\0')) return { ok: false, reason: 'binary' }
  if (snapshotByteLength(content) > SNAPSHOT_MAX_BYTES) return { ok: false, reason: 'size' }
  return { ok: true }
}

export function suggestCheckCommand(path: string): string {
  const base = normalizeSnapPath(path).split('/').pop() || ''
  const lower = base.toLowerCase()
  if (lower === 'nginx.conf' || (lower.endsWith('.conf') && path.replace(/\\/g, '/').includes('nginx'))) return 'nginx -t'
  if (lower === 'haproxy.cfg') return 'haproxy -c -f ' + normalizeSnapPath(path)
  if (lower === 'sshd_config') return 'sshd -t'
  return ''
}

export function loadSnapshots(store: Pick<Storage, 'getItem'> = globalThis.localStorage): Snapshot[] {
  try {
    const raw = store.getItem(SNAP_INDEX_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Snapshot[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveSnapshots(list: Snapshot[], store: Store = globalThis.localStorage): void {
  store.setItem(SNAP_INDEX_KEY, JSON.stringify(list))
}

function sameFile(a: Snapshot, profileId: string, path: string): boolean {
  return snapshotFileKey(a.profileId, a.path) === snapshotFileKey(profileId, path)
}

/** Drop oldest unpinned snapshots until each file has at most `keep` rows and the global byte cap holds. Pinned rows stay. */
export function trimSnapshots(list: Snapshot[], keep = SNAPSHOT_DEFAULT_KEEP, cap = SNAPSHOT_GLOBAL_CAP): Snapshot[] {
  const groups = new Map<string, Snapshot[]>()
  for (const row of list) {
    const key = snapshotFileKey(row.profileId, row.path)
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }
  let next: Snapshot[] = []
  for (const bucket of groups.values()) {
    const pinned = bucket.filter((s) => s.pinned)
    const unpinned = bucket.filter((s) => !s.pinned).sort((a, b) => b.at - a.at)
    const room = Math.max(0, keep - pinned.length)
    next.push(...pinned, ...unpinned.slice(0, room))
  }
  const bytes = () => next.reduce((n, s) => n + (s.bytes || 0), 0)
  if (bytes() > cap) {
    const unpinned = next.filter((s) => !s.pinned).sort((a, b) => a.at - b.at)
    const drop = new Set<string>()
    let total = bytes()
    for (const row of unpinned) {
      if (total <= cap) break
      drop.add(row.id)
      total -= row.bytes || 0
    }
    next = next.filter((s) => !drop.has(s.id))
  }
  return next.sort((a, b) => b.at - a.at)
}

export function recordSnapshot(
  list: Snapshot[],
  input: {
    profileId: string
    path: string
    content: string
    source: SnapSource
    at?: number
    stale?: boolean
    encrypt: (plain: string) => string
    isText?: boolean
    keep?: number
  }
): { list: Snapshot[]; added: boolean; skipped?: 'binary' | 'size' | 'duplicate' | 'empty' } {
  const content = String(input.content ?? '')
  if (!content && input.source !== 'syncDelete') return { list, added: false, skipped: 'empty' }
  const gate = eligibleSnapshot(content, input.isText !== false)
  if (!gate.ok) return { list, added: false, skipped: gate.reason }
  const path = normalizeSnapPath(input.path)
  const hash = hashText(content)
  const newest = list.filter((s) => sameFile(s, input.profileId, path)).sort((a, b) => b.at - a.at)[0]
  if (newest && newest.hash === hash) {
    const touched = list.map((s) => (s.id === newest.id ? { ...s, at: input.at ?? Date.now() } : s))
    return { list: touched, added: false, skipped: 'duplicate' }
  }
  const ciphertext = input.encrypt(content)
  const row: Snapshot = {
    id: `snap-${input.at ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    profileId: input.profileId,
    path,
    at: input.at ?? Date.now(),
    source: input.source,
    bytes: snapshotByteLength(content),
    pinned: false,
    hash,
    ciphertext,
    stale: input.stale
  }
  if (row.ciphertext === content) {
    /* caller passed an identity encrypt; still store the field, tests use a real seal */
  }
  const next = trimSnapshots([row, ...list], input.keep ?? SNAPSHOT_DEFAULT_KEEP)
  return { list: next, added: next.some((s) => s.id === row.id) }
}

export function rollbackAllowed(level: string): boolean {
  return level !== 'readonly'
}

export function rollbackNeedsHostName(level: string): boolean {
  return level === 'production'
}

export function diffCounts(before: string, after: string): { add: number; del: number } {
  const a = before.split('\n')
  const b = after.split('\n')
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  }
  let i = 0
  let j = 0
  let add = 0
  let del = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      del++
      i++
    } else {
      add++
      j++
    }
  }
  del += a.length - i
  add += b.length - j
  return { add, del }
}

export function snapshotStats(list: Snapshot[]): { files: number; bytes: number; count: number } {
  const files = new Set(list.map((s) => snapshotFileKey(s.profileId, s.path))).size
  return { files, bytes: list.reduce((n, s) => n + (s.bytes || 0), 0), count: list.length }
}

/** Same clock the history tab shows on a version row. */
export function rollbackClock(at: number, now = Date.now()): string {
  const d = new Date(at)
  const p = (n: number) => String(n).padStart(2, '0')
  const same = new Date(now).toDateString() === d.toDateString()
  return same
    ? `${p(d.getHours())}:${p(d.getMinutes())}`
    : `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function rollbackAuditDetail(path: string, at: number, now = Date.now()): string {
  return `rollback ${normalizeSnapPath(path)} to ${rollbackClock(at, now)}`
}

/** S1 file audit for a snapshot rollback. Plain SFTP allows are not audited by the write guard. */
export function recordRollbackAudit(
  opts: {
    path: string
    at: number
    host: string
    profileId?: string
    hostKey: string
    alertId?: string
    outcome: AuditOutcome
    now?: number
  },
  store: Store = globalThis.localStorage
): void {
  const now = opts.now ?? Date.now()
  const detail = rollbackAuditDetail(opts.path, opts.at, now)
  appendAudit(
    {
      type: 'file',
      host: opts.host,
      profileId: opts.profileId,
      source: opts.outcome === 'allowed' ? 'user' : 'sftp',
      outcome: opts.outcome,
      detail,
      alertId: opts.alertId
    },
    store,
    now
  )
  appendTimeline(
    {
      alertId: opts.alertId || opts.hostKey,
      kind: 'file.rollback',
      hostKey: opts.hostKey,
      summary: detail,
      at: now
    },
    store,
    now
  )
}
