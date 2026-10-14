import type { SyncRow } from '@shared/folder-sync'
import { joinPosix } from '@shared/sftp-queue'

export type FolderSyncPlan = {
  direction: 'upload' | 'download'
  localRoot: string
  remoteRoot: string
  rows: SyncRow[]
  deleteExtra: boolean
  sessionId?: string
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
  for (const row of plan.rows) {
    if (row.kind === 'deleted') {
      if (!plan.deleteExtra) continue
      try {
        if (plan.direction === 'upload') await window.aiss.sftp.remove(sid, joinPosix(plan.remoteRoot, row.rel))
        if (plan.direction === 'download') await window.aiss.localFs.trash(joinLocal(plan.localRoot, row.rel))
      } catch {
        /* deletes are best-effort, same as the SFTP panel */
      }
      continue
    }
    if (row.kind !== 'new' && row.kind !== 'changed') continue
    const localPath = joinLocal(plan.localRoot, row.rel)
    const remotePath = joinPosix(plan.remoteRoot, row.rel)
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
  return 'ran'
}
