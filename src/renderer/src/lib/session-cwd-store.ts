/** D2: last known cwd per SSH session (memory only). D12: a change fires SESSION_CWD_EVENT. */
const cwds = new Map<string, string>()

export const SESSION_CWD_EVENT = 'aiss-session-cwd'

export function setSessionCwd(sessionId: string, cwd: string): void {
  if (!sessionId) return
  const prev = cwds.get(sessionId)
  cwds.delete(sessionId)
  cwds.set(sessionId, cwd)
  if (cwds.size > 200) cwds.delete(cwds.keys().next().value as string)
  if (prev !== cwd && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_CWD_EVENT, { detail: { sessionId, cwd } }))
  }
}

export function getSessionCwd(sessionId: string | null | undefined): string | null {
  return sessionId ? cwds.get(sessionId) ?? null : null
}
