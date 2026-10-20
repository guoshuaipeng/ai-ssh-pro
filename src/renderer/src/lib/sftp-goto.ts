/** D41: hand a target path to an SFTP panel that may mount later. */
export const SFTP_GOTO_EVENT = 'aiss-sftp-goto'
const pending = new Map<string, string>()

export function requestSftpGoto(sessionId: string, path: string): void {
  pending.set(sessionId, path)
  window.dispatchEvent(new CustomEvent(SFTP_GOTO_EVENT, { detail: { sessionId } }))
}

export function takeSftpGoto(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null
  const p = pending.get(sessionId) ?? null
  pending.delete(sessionId)
  return p
}
