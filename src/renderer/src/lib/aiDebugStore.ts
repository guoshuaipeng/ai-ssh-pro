import type { AiDebugEntry, AiDebugStreamPayload } from '@shared/ipc'

export type AiDebugSession = {
  id: string
  userQuestion: string
  startedAt: number
  entries: AiDebugEntry[]
}

const MAX_SESSIONS = 80

let sessions: AiDebugSession[] = []
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

export function subscribeAiDebug(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getAiDebugSessions(): AiDebugSession[] {
  return sessions
}

export function pushAiDebugPayload(p: AiDebugStreamPayload): void {
  let s = sessions.find((x) => x.id === p.debugTurnId)
  if (!s) {
    s = { id: p.debugTurnId, userQuestion: p.userQuestion, startedAt: Date.now(), entries: [] }
    sessions = [s, ...sessions]
    if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS)
  }
  s.entries.push(p.entry)
  notify()
}

export function clearAiDebugSessions(): void {
  sessions = []
  notify()
}
