/**
 * M20: per-SSH-session host protection, pushed by the renderer whenever it changes
 * (profile level, demo default, per-tab temporary read-only, elevation window).
 * The agent reads it at write time, so a tab locked mid-reply is honoured.
 */
import { isProtectionLevel, type AiHostProtection } from '../shared/ai-write-guard'

const bySession = new Map<string, AiHostProtection>()

export function setSessionProtection(sessionId: string, p: AiHostProtection | null | undefined): void {
  const key = String(sessionId ?? '').trim()
  if (!key) return
  if (!p || !isProtectionLevel(p.level)) {
    bySession.delete(key)
    return
  }
  bySession.set(key, { level: p.level, elevated: p.elevated === true })
}

export function getSessionProtection(sessionId: string | null | undefined): AiHostProtection | null {
  const key = String(sessionId ?? '').trim()
  return key ? bySession.get(key) ?? null : null
}

export function clearSessionProtection(): void {
  bySession.clear()
}
