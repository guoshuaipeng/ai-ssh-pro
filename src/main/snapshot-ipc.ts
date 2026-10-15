/** W3 snapshot files live under userData/snapshots and are sealed with safeStorage. */
import { app, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decryptSecret, encryptSecret } from './secret-crypto'
import {
  SNAPSHOT_DEFAULT_KEEP,
  SNAP_INDEX_KEY,
  loadSnapshots,
  normalizeSnapPath,
  normalizeSnapshotKeep,
  recordSnapshot,
  rollbackAllowed,
  saveSnapshots,
  shouldRecordSnapshot,
  snapshotStats,
  type SnapSource,
  type Snapshot
} from '../shared/snapshots'

type Store = Pick<Storage, 'getItem' | 'setItem'>

function root(): string {
  const dir = join(app.getPath('userData'), 'snapshots')
  mkdirSync(dir, { recursive: true })
  return dir
}

function fileStore(): Store {
  const file = join(root(), 'index.json')
  return {
    getItem: (key) => {
      if (key !== SNAP_INDEX_KEY || !existsSync(file)) return null
      return readFileSync(file, 'utf8')
    },
    setItem: (key, value) => {
      if (key !== SNAP_INDEX_KEY) return
      writeFileSync(file, value, 'utf8')
    }
  }
}

type SnapPrefs = { auto: boolean; keep: number }

function prefsFile(): string {
  return join(root(), 'prefs.json')
}

function readPrefs(): SnapPrefs {
  try {
    if (!existsSync(prefsFile())) return { auto: true, keep: SNAPSHOT_DEFAULT_KEEP }
    const parsed = JSON.parse(readFileSync(prefsFile(), 'utf8')) as Partial<SnapPrefs>
    return { auto: parsed.auto !== false, keep: normalizeSnapshotKeep(parsed.keep) }
  } catch {
    return { auto: true, keep: SNAPSHOT_DEFAULT_KEEP }
  }
}

function writePrefs(prefs: SnapPrefs): SnapPrefs {
  const next = { auto: prefs.auto !== false, keep: normalizeSnapshotKeep(prefs.keep) }
  writeFileSync(prefsFile(), JSON.stringify(next), 'utf8')
  return next
}

function publicRow(row: Snapshot) {
  const { ciphertext: _c, ...rest } = row
  return rest
}

export function registerSnapshotIpc(): void {
  const store = () => fileStore()
  ipcMain.handle('snapshots:list', (_e, query?: { profileId?: string; path?: string }) => {
    const list = loadSnapshots(store())
    return list
      .filter((s) => !query?.profileId || s.profileId === query.profileId)
      .filter((s) => !query?.path || s.path === query.path)
      .map(publicRow)
  })
  ipcMain.handle('snapshots:stats', () => snapshotStats(loadSnapshots(store())))
  ipcMain.handle(
    'snapshots:put',
    (
      _e,
      input: { profileId: string; path: string; content: string; source: SnapSource; stale?: boolean; isText?: boolean; keep?: number; auto?: boolean }
    ) => {
      const prefs = readPrefs()
      const auto = typeof input.auto === 'boolean' ? input.auto : prefs.auto
      const keep = typeof input.keep === 'number' ? normalizeSnapshotKeep(input.keep) : prefs.keep
      if (typeof input.auto === 'boolean' || typeof input.keep === 'number') writePrefs({ auto, keep })
      const current = loadSnapshots(store())
      const path = normalizeSnapPath(input.path)
      const countOf = (list: Snapshot[]) => list.filter((s) => s.profileId === input.profileId && s.path === path).length
      if (!shouldRecordSnapshot(input.source, auto)) {
        return { added: false, skipped: 'disabled', count: countOf(current) }
      }
      const result = recordSnapshot(current, {
        ...input,
        encrypt: encryptSecret,
        keep
      })
      saveSnapshots(result.list, store())
      return { added: result.added, skipped: result.skipped ?? null, count: countOf(result.list) }
    }
  )
  ipcMain.handle('snapshots:setPrefs', (_e, input?: { auto?: boolean; keep?: number }) => {
    const prev = readPrefs()
    return writePrefs({
      auto: typeof input?.auto === 'boolean' ? input.auto : prev.auto,
      keep: input?.keep != null ? normalizeSnapshotKeep(input.keep) : prev.keep
    })
  })
  ipcMain.handle('snapshots:read', (_e, id: string) => {
    const row = loadSnapshots(store()).find((s) => s.id === id)
    if (!row) return { ok: false, reason: 'missing' }
    try {
      return { ok: true, content: decryptSecret(row.ciphertext), snapshot: publicRow(row) }
    } catch {
      return { ok: false, reason: 'decrypt' }
    }
  })
  ipcMain.handle('snapshots:pin', (_e, id: string, pinned: boolean) => {
    const next = loadSnapshots(store()).map((s) => (s.id === id ? { ...s, pinned } : s))
    saveSnapshots(next, store())
    return next.filter((s) => s.id === id).map(publicRow)[0] ?? null
  })
  ipcMain.handle('snapshots:delete', (_e, id: string) => {
    const prev = loadSnapshots(store())
    saveSnapshots(prev.filter((s) => s.id !== id), store())
    return { ok: true }
  })
  ipcMain.handle('snapshots:clear', () => {
    const n = loadSnapshots(store()).length
    saveSnapshots([], store())
    return { ok: true, n }
  })
  ipcMain.handle('snapshots:openDir', async () => {
    await shell.openPath(root())
    return { ok: true }
  })
  ipcMain.handle('snapshots:rollbackAllowed', (_e, level: string) => rollbackAllowed(level))
}
