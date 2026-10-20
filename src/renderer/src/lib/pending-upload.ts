/** D9: files dropped on a terminal wait here until that session's SFTP panel picks them up. */
export const PENDING_UPLOAD_EVENT = 'aiss-pending-upload'

const pending = new Map<string, { dir: string; paths: string[] }>()

export function setPendingUpload(sessionId: string, dir: string, paths: string[]): void {
  const prev = pending.get(sessionId)
  pending.set(sessionId, prev && prev.dir === dir ? { dir, paths: [...prev.paths, ...paths] } : { dir, paths })
  window.setTimeout(() => window.dispatchEvent(new Event(PENDING_UPLOAD_EVENT)), 0)
}

export function takePendingUpload(sessionId: string | null | undefined): { dir: string; paths: string[] } | null {
  if (!sessionId) return null
  const p = pending.get(sessionId) ?? null
  pending.delete(sessionId)
  return p
}
