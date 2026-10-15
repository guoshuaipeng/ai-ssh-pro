/** Read a remote text file and keep a local snapshot. Failure must not block the write. */
import { eligibleSnapshot, snapshotsEnabled, type SnapSource } from '@shared/snapshots'

export async function captureRemoteSnapshot(input: {
  sessionId: string
  profileId?: string
  path: string
  source: SnapSource
}): Promise<'kept' | 'skipped' | 'off'> {
  const api = globalThis.window?.aiss
  if (!input.profileId || !input.sessionId || !snapshotsEnabled() || !api?.snapshots?.put || !api?.sftp?.readText) return 'off'
  try {
    const res = await api.sftp.readText(input.sessionId, input.path, 2 * 1024 * 1024)
    const content = res?.content ?? ''
    if (!eligibleSnapshot(content, true).ok) return 'skipped'
    const kept = await api.snapshots.put({
      profileId: input.profileId,
      path: input.path,
      content,
      source: input.source,
      isText: true
    })
    return kept.added || kept.skipped === 'duplicate' ? 'kept' : 'skipped'
  } catch {
    return 'skipped'
  }
}
