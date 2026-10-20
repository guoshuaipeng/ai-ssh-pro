/** D49: plain-text session summary for bug reports / hand-over. No secrets: no password, key path, or env. */
import { redactAuditText } from './audit-log'
import type { LastRun } from './failed-output'

export type SessionInfoInput = {
  title: string
  kind: 'ssh' | 'local'
  user?: string
  host?: string
  port?: number
  status: string
  cwd?: string | null
  reason?: string
  last?: LastRun | null
  sensitive?: (cmd: string) => boolean
  now?: Date
}

export function sessionInfoText(i: SessionInfoInput): string {
  const lines: string[] = [`# ${i.title}`]
  if (i.kind === 'local') lines.push('target: local shell')
  else lines.push(`target: ${i.user ? i.user + '@' : ''}${i.host ?? ''}${i.port && i.port !== 22 ? ':' + i.port : ''}`)
  lines.push(`status: ${i.status}${i.reason ? ` (${redactAuditText(i.reason)})` : ''}`)
  if (i.cwd) lines.push(`cwd: ${i.cwd}`)
  if (i.last && i.last.command.trim() && !(i.sensitive?.(i.last.command) ?? false)) {
    lines.push(`last: ${redactAuditText(i.last.command.trim())}  (exit ${i.last.code})`)
  }
  lines.push(`time: ${(i.now ?? new Date()).toISOString()}`)
  return lines.join('\n')
}
