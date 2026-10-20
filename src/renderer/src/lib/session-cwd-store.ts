/** D2: last known cwd per SSH session (memory only). */
const cwds = new Map<string, string>()

export function setSessionCwd(sessionId: string, cwd: string): void {
  if (!sessionId) return
  cwds.delete(sessionId)
  cwds.set(sessionId, cwd)
  if (cwds.size > 200) cwds.delete(cwds.keys().next().value as string)
}

export function getSessionCwd(sessionId: string | null | undefined): string | null {
  return sessionId ? cwds.get(sessionId) ?? null : null
}
