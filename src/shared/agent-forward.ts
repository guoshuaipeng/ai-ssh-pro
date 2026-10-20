/** C3: SSH agent forwarding policy. Per host, default off. No electron/node imports. */
import type { ProtectionLevel } from './protection'

/** Turning it on for read-only or production hosts asks first. Turning it off never asks. */
export function agentForwardNeedsConfirm(next: boolean, level: ProtectionLevel | undefined): boolean {
  return next && (level === 'readonly' || level === 'production')
}

/** Only an explicit true enables it; missing or anything else is off. */
export function agentForwardEnabled(v: unknown): boolean {
  return v === true
}

export function agentForwardAuditDetail(kind: 'on' | 'off' | 'session', host: string): string {
  if (kind === 'session') return `agent forwarding active for session on ${host}`
  return `agent forwarding ${kind === 'on' ? 'enabled' : 'disabled'} for ${host}`
}
