/** L3 vault payload, conflict detection, and the forced-backup rule. Encryption is the backup envelope. */
import type { SavedSessionProfile } from './ipc'

export type SyncProvider = 'gist' | 'webdav'

export type SyncScope = {
  connections: boolean
  snippets: boolean
  forwards: boolean
  settings: boolean
  credentials: boolean
}

export const DEFAULT_SCOPE: SyncScope = {
  connections: true,
  snippets: true,
  forwards: true,
  settings: true,
  credentials: false
}

export type SyncItemKind = 'connection' | 'snippet' | 'forward' | 'setting'

export type SyncItem = {
  id: string
  kind: SyncItemKind
  name: string
  updatedAt: number
  deleted?: boolean
  body: unknown
}

export type SyncConflict = {
  id: string
  kind: SyncItemKind
  name: string
  local?: SyncItem
  remote?: SyncItem
  reason: 'both-changed' | 'delete-modify'
}

export type SyncPhase = 'off' | 'synced' | 'syncing' | 'conflict' | 'error'

export function statusGlyph(phase: SyncPhase): '' | '✓' | '⟳' | '!' | '✕' {
  if (phase === 'synced') return '✓'
  if (phase === 'syncing') return '⟳'
  if (phase === 'conflict') return '!'
  if (phase === 'error') return '✕'
  return ''
}

export function normalizeScope(raw: Partial<SyncScope> | null | undefined): SyncScope {
  return {
    connections: raw?.connections !== false,
    snippets: raw?.snippets !== false,
    forwards: raw?.forwards !== false,
    settings: raw?.settings !== false,
    credentials: raw?.credentials === true
  }
}

function stripProfile(profile: SavedSessionProfile, credentials: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = { ...profile }
  if (!credentials) {
    delete body.password
    delete body.passphrase
    delete body.privateKeyPath
    delete body.certificatePath
    if (body.jumpHost && typeof body.jumpHost === 'object') {
      const j = { ...(body.jumpHost as Record<string, unknown>) }
      delete j.password
      delete j.passphrase
      delete j.privateKeyPath
      body.jumpHost = j
    }
    if (Array.isArray(body.jumpChain)) {
      body.jumpChain = (body.jumpChain as Array<Record<string, unknown>>).map((hop) => {
        const h = { ...hop }
        delete h.password
        delete h.passphrase
        delete h.privateKeyPath
        return h
      })
    }
  }
  return body
}

export function buildVault(input: {
  profiles?: SavedSessionProfile[]
  snippets?: Array<{ id: string; title: string; body: string; updatedAt?: number }>
  forwards?: Array<{ id: string; name: string; updatedAt?: number; body: unknown }>
  settings?: Record<string, unknown> | null
  scope?: Partial<SyncScope>
  revisions?: Record<string, number>
  now?: number
}): SyncItem[] {
  const scope = normalizeScope(input.scope)
  const now = input.now ?? Date.now()
  const rev = input.revisions ?? {}
  const items: SyncItem[] = []
  if (scope.connections) {
    for (const p of input.profiles ?? []) {
      const id = `connection:${p.id}`
      items.push({
        id,
        kind: 'connection',
        name: p.label || p.host,
        updatedAt: rev[id] ?? now,
        body: stripProfile(p, scope.credentials)
      })
    }
  }
  if (scope.snippets) {
    for (const s of input.snippets ?? []) {
      const id = `snippet:${s.id}`
      items.push({ id, kind: 'snippet', name: s.title, updatedAt: s.updatedAt ?? rev[id] ?? now, body: { id: s.id, title: s.title, body: s.body } })
    }
  }
  if (scope.forwards) {
    for (const f of input.forwards ?? []) {
      const id = `forward:${f.id}`
      items.push({ id, kind: 'forward', name: f.name, updatedAt: f.updatedAt ?? rev[id] ?? now, body: f.body })
    }
  }
  if (scope.settings && input.settings) {
    items.push({ id: 'setting:ui', kind: 'setting', name: 'ui', updatedAt: rev['setting:ui'] ?? now, body: input.settings })
  }
  return items
}

export function vaultHasSecrets(items: SyncItem[]): boolean {
  const blob = JSON.stringify(items)
  return /"password"\s*:/.test(blob) || /"passphrase"\s*:/.test(blob) || /"privateKeyPath"\s*:/.test(blob)
}

function canon(item: SyncItem | undefined): string {
  if (!item) return ''
  return JSON.stringify({ deleted: Boolean(item.deleted), body: item.body })
}

/** Conflicts since the last synced revision. A delete on one side and an edit on the other is a conflict. */
export function findConflicts(local: SyncItem[], remote: SyncItem[], base: Record<string, number> = {}): SyncConflict[] {
  const ids = new Set([...local.map((i) => i.id), ...remote.map((i) => i.id)])
  const out: SyncConflict[] = []
  for (const id of ids) {
    const l = local.find((i) => i.id === id)
    const r = remote.find((i) => i.id === id)
    const baseAt = base[id] ?? 0
    const localChanged = l ? l.updatedAt > baseAt : baseAt > 0
    const remoteChanged = r ? r.updatedAt > baseAt : baseAt > 0
    if (!localChanged || !remoteChanged) continue
    if (canon(l) === canon(r)) continue
    const deleted = Boolean(l?.deleted) !== Boolean(r?.deleted) || (!l && r) || (l && !r)
    const sample = l ?? r!
    out.push({
      id,
      kind: sample.kind,
      name: sample.name,
      local: l,
      remote: r,
      reason: !l || !r || l.deleted || r.deleted || deleted ? 'delete-modify' : 'both-changed'
    })
  }
  return out
}

export function applyChoice(conflict: SyncConflict, side: 'local' | 'cloud' | 'both'): SyncItem[] {
  const local = conflict.local
  const remote = conflict.remote
  if (side === 'local' && local) return [{ ...local, deleted: Boolean(local.deleted) }]
  if (side === 'cloud' && remote) return [{ ...remote, deleted: Boolean(remote.deleted) }]
  if (side === 'both') {
    const kept: SyncItem[] = []
    if (local && !local.deleted) kept.push({ ...local, id: local.id })
    if (remote && !remote.deleted) {
      kept.push({ ...remote, id: remote.id === local?.id ? `${remote.id}~cloud` : remote.id, name: `${remote.name} (cloud)` })
    }
    return kept
  }
  return []
}

/** Overwrite-local is refused until a backup file exists, unless the user confirmed skip twice. */
export function overwriteLocalAllowed(opts: { backupCompleted: boolean; skipConfirmed: boolean }): { ok: boolean; reason?: 'backup-required' } {
  if (opts.backupCompleted || opts.skipConfirmed) return { ok: true }
  return { ok: false, reason: 'backup-required' }
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join('••••')
  }
  return out
}

export const SYNC_META_KEY = 'aiss.sync.meta.v1'
export const SYNC_BASE_KEY = 'aiss.sync.base.v1'
export const SYNC_REV_KEY = 'aiss.sync.rev.v1'

export type SyncMeta = {
  enabled: boolean
  provider: SyncProvider
  phase: SyncPhase
  lastOkAt?: number
  lastError?: string
  remoteCount: number
  device?: string
}

export function loadSyncMeta(store: Pick<Storage, 'getItem'> = globalThis.localStorage): SyncMeta {
  try {
    const raw = store.getItem(SYNC_META_KEY)
    if (!raw) return { enabled: false, provider: 'gist', phase: 'off', remoteCount: 0 }
    const o = JSON.parse(raw) as Partial<SyncMeta>
    return {
      enabled: Boolean(o.enabled),
      provider: o.provider === 'webdav' ? 'webdav' : 'gist',
      phase: o.phase === 'synced' || o.phase === 'syncing' || o.phase === 'conflict' || o.phase === 'error' ? o.phase : o.enabled ? 'synced' : 'off',
      lastOkAt: typeof o.lastOkAt === 'number' ? o.lastOkAt : undefined,
      lastError: typeof o.lastError === 'string' ? o.lastError : undefined,
      remoteCount: typeof o.remoteCount === 'number' ? o.remoteCount : 0,
      device: typeof o.device === 'string' ? o.device : undefined
    }
  } catch {
    return { enabled: false, provider: 'gist', phase: 'off', remoteCount: 0 }
  }
}

export function saveSyncMeta(meta: SyncMeta, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(SYNC_META_KEY, JSON.stringify(meta))
}
