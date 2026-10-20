/** D14: per-session Shell Integration state (renderer memory). */
import { SHELL_INT_KEY, integrationVerdict, shellIntegrationEnabled, type IntegrationState } from '@shared/shell-integration'

export const SHELL_INT_EVENT = 'aiss-shell-int'
export const SHELL_EXIT_EVENT = 'aiss-shell-exit'

const sessions = new Map<string, { sentAt: number | null; seen: boolean }>()

export function shellIntOn(): boolean {
  try {
    return shellIntegrationEnabled((k) => localStorage.getItem(k))
  } catch {
    return false
  }
}

export function setShellIntOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(SHELL_INT_KEY, '1')
    else localStorage.removeItem(SHELL_INT_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(SHELL_INT_EVENT, { detail: { on } }))
}

export function noteInjected(sessionId: string, now = Date.now()): void {
  sessions.set(sessionId, { sentAt: now, seen: sessions.get(sessionId)?.seen ?? false })
}

export function noteMarker(sessionId: string): void {
  const s = sessions.get(sessionId)
  sessions.set(sessionId, { sentAt: s?.sentAt ?? null, seen: true })
}

export function wasInjected(sessionId: string): boolean {
  return sessions.get(sessionId)?.sentAt != null
}

export function integrationState(sessionId: string | null | undefined, now = Date.now()): IntegrationState {
  if (!sessionId) return 'off'
  const s = sessions.get(sessionId)
  return integrationVerdict(s?.sentAt ?? null, s?.seen ?? false, now)
}

export function forgetSession(sessionId: string): void {
  sessions.delete(sessionId)
}
