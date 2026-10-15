/** W3 snapshot files live under userData/snapshots and are sealed with safeStorage. */
import { app, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { decryptSecret, encryptSecret } from './secret-crypto'
import {
  SNAP_INDEX_KEY,
  loadSnapshots,
  recordSnapshot,
  rollbackAllowed,
  saveSnapshots,
  snapshotKeep,
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
      input: { profileId: string; path: string; content: string; source: SnapSource; stale?: boolean; isText?: boolean }
    ) => {
      const current = loadSnapshots(store())
      const result = recordSnapshot(current, {
        ...input,
        encrypt: encryptSecret,
        keep: snapshotKeep()
      })
      saveSnapshots(result.list, store())
      return { added: result.added, skipped: result.skipped ?? null, count: result.list.filter((s) => s.profileId === input.profileId && s.path === input.path).length }
    }
  )
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
