import type { SavedSessionProfile } from '@shared/ipc'
import {
  buildVault,
  findConflicts,
  loadSyncMeta,
  saveSyncMeta,
  vaultHasSecrets,
  type SyncConflict,
  type SyncItem,
  type SyncMeta,
  type SyncScope
} from '@shared/sync-vault'
import { tg } from './i18n'
import { showToast } from './toast'

export type PublicSyncConfig = {
  provider: 'gist' | 'webdav'
  gistId: string
  webdavUrl: string
  username: string
  hasToken: boolean
  hasPassword: boolean
  hasSyncPassphrase?: boolean
  hasVaultPass?: boolean
  scope: SyncScope
}

type SnippetRow = { id: string; title: string; body: string; updatedAt?: number }

function publish(meta: SyncMeta) {
  saveSyncMeta(meta)
  window.dispatchEvent(new Event('aiss-sync-meta'))
}

/** A vault passphrase plus a reachable Gist token or WebDAV login. */
export function syncIsConfigured(cfg: PublicSyncConfig | null | undefined): boolean {
  if (!(cfg?.hasSyncPassphrase || cfg?.hasVaultPass)) return false
  if (cfg.provider === 'webdav') return Boolean(cfg.webdavUrl.trim() && cfg.username.trim() && cfg.hasPassword)
  return cfg.hasToken
}

/** Push the local vault, then pull. Opens nothing; conflicts are handed to the caller. */
export async function runCloudSync(
  profiles: SavedSessionProfile[],
  snippets: SnippetRow[],
  onConflicts: (rows: SyncConflict[]) => void
): Promise<'ok' | 'conflict' | 'error' | 'unconfigured'> {
  const cfg = (await window.aiss.sync.getConfig()) as PublicSyncConfig | null
  if (!syncIsConfigured(cfg) || !cfg) return 'unconfigured'
  const scope = cfg.scope
  const provider = cfg.provider
  const items = buildVault({
    profiles,
    snippets,
    scope,
    settings: { locale: localStorage.getItem('aiss.locale') || '' }
  })
  if (!scope.credentials && vaultHasSecrets(items)) {
    showToast(tg('m2.secretLeak'), { kind: 'error' })
    return 'error'
  }
  publish({ ...loadSyncMeta(), enabled: true, provider, phase: 'syncing', remoteCount: items.length })
  const pushed = await window.aiss.sync.push({ items, scope }, '')
  if (!pushed.ok) {
    publish({ ...loadSyncMeta(), phase: 'error', lastError: pushed.message })
    showToast(pushed.message || tg('m2.phase.error'), { kind: 'error' })
    return 'error'
  }
  localStorage.setItem('aiss.sync.base.v1', JSON.stringify(Object.fromEntries(items.map((i) => [i.id, i.updatedAt]))))
  const pulled = await window.aiss.sync.pull('')
  if (!pulled.ok) {
    publish({ ...loadSyncMeta(), phase: 'error', lastError: pulled.message })
    showToast(pulled.message || tg('m2.phase.error'), { kind: 'error' })
    return 'error'
  }
  const remote = ((pulled.payload as { items?: SyncItem[] } | null)?.items ?? []) as SyncItem[]
  const local = buildVault({ profiles, snippets, scope })
  let base: Record<string, number> = {}
  try {
    base = JSON.parse(localStorage.getItem('aiss.sync.base.v1') || '{}') as Record<string, number>
  } catch {
    base = {}
  }
  const conflicts = findConflicts(local, remote, base)
  if (conflicts.length) {
    sessionStorage.setItem('aiss.sync.conflicts', JSON.stringify(conflicts))
    publish({ ...loadSyncMeta(), phase: 'conflict', remoteCount: remote.length })
    onConflicts(conflicts)
    return 'conflict'
  }
  publish({
    ...loadSyncMeta(),
    enabled: true,
    provider,
    phase: 'synced',
    lastOkAt: Date.now(),
    remoteCount: remote.length,
    lastError: undefined
  })
  showToast(tg('m2.pulled'))
  return 'ok'
}
