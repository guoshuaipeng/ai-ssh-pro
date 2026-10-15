import type { SyncRow } from '@shared/folder-sync'
import { joinPosix } from '@shared/sftp-queue'
import { tg } from './i18n'
import { captureRemoteSnapshot } from './remote-snapshot'
import { showToast } from './toast'

export type FolderSyncPlan = {
  direction: 'upload' | 'download'
  localRoot: string
  remoteRoot: string
  rows: SyncRow[]
  deleteExtra: boolean
  sessionId?: string
  profileId?: string
}

type Runner = (plan: FolderSyncPlan) => void | Promise<void>

const runners = new Map<string, Runner>()

/** SFTP panel registers while it is mounted so a pinned preview can delegate to the live queue. */
export function registerFolderSyncRunner(sessionId: string, runner: Runner): () => void {
  if (!sessionId) return () => undefined
  runners.set(sessionId, runner)
  return () => {
    if (runners.get(sessionId) === runner) runners.delete(sessionId)
  }
}

function joinLocal(dir: string, name: string): string {
  if (!dir) return name
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + name
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return dir + sep + name
}

/**
 * Start a folder sync even when the SFTP tab is closed.
 * A mounted panel handles its own session; otherwise transfers run here after the write gate.
 */
export async function runFolderSyncDurable(
  plan: FolderSyncPlan,
  beforeRemoteWrite?: () => Promise<boolean>
): Promise<'delegated' | 'ran' | 'blocked' | 'no-session'> {
  const sid = plan.sessionId || ''
  const live = sid ? runners.get(sid) : undefined
  if (live) {
    await live(plan)
    return 'delegated'
  }
  if (!sid) return 'no-session'
  if (!beforeRemoteWrite || !(await beforeRemoteWrite())) return 'blocked'
  let kept = 0
  let skipped = 0
  for (const row of plan.rows) {
    if (row.kind === 'deleted') {
      if (!plan.deleteExtra) continue
      try {
        if (plan.direction === 'upload') {
          const remotePath = joinPosix(plan.remoteRoot, row.rel)
          const snap = await captureRemoteSnapshot({ sessionId: sid, profileId: plan.profileId, path: remotePath, source: 'syncDelete' })
          if (snap === 'kept') kept += 1
          else if (snap === 'skipped') skipped += 1
          await window.aiss.sftp.remove(sid, remotePath)
        }
        if (plan.direction === 'download') await window.aiss.localFs.trash(joinLocal(plan.localRoot, row.rel))
      } catch {
        /* deletes are best-effort, same as the SFTP panel */
      }
      continue
    }
    if (row.kind !== 'new' && row.kind !== 'changed') continue
    const localPath = joinLocal(plan.localRoot, row.rel)
    const remotePath = joinPosix(plan.remoteRoot, row.rel)
    if (plan.direction === 'upload' && row.kind === 'changed') {
      const snap = await captureRemoteSnapshot({ sessionId: sid, profileId: plan.profileId, path: remotePath, source: 'sync' })
      if (snap === 'kept') kept += 1
      else if (snap === 'skipped') skipped += 1
    }
    const transferId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await window.aiss.sftp.transfer({
      sessionId: sid,
      direction: plan.direction,
      localPath,
      remotePath,
      transferId,
      offset: 0
    })
  }
  window.dispatchEvent(new CustomEvent('aiss-task-transfer'))
  if (kept) showToast(tg('w3.syncSnapN', { n: kept }))
  if (skipped) showToast(tg('w3.syncSkippedN', { n: skipped }))
  return 'ran'
}
