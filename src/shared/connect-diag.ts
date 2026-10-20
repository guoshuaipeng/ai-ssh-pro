import type { ConnectStage } from './connect-stage'
import { redactAuditText } from './audit-log'

/** D83: plain-text connection diagnostics for the failure card. No passwords, passphrases or key contents. */
export type ConnectDiagInput = {
  target: string
  user: string
  authMode?: string
  jumpHops: number
  kind: string
  stage?: ConnectStage | null
  elapsedMs?: number | null
  timeoutSec: number
  keepAliveSec: number | null
  appVersion?: string
  raw: string
  at: Date
}

export function buildConnectDiag(d: ConnectDiagInput): string {
  const lines = [
    'AI-SSH-Pro connection diagnostics',
    `time: ${d.at.toISOString()}`,
    `target: ${d.user}@${d.target}`,
    `auth: ${d.authMode || 'auto'}`,
    `jump hops: ${d.jumpHops}`,
    `kind: ${d.kind}`,
    `last stage: ${d.stage ?? 'unknown'}`,
    `elapsed: ${typeof d.elapsedMs === 'number' ? (d.elapsedMs / 1000).toFixed(1) + 's' : 'unknown'}`,
    `handshake timeout: ${d.timeoutSec}s`,
    `keep-alive: ${d.keepAliveSec == null ? 'off' : d.keepAliveSec + 's'}`,
    ...(d.appVersion ? [`app: ${d.appVersion}`] : []),
    'error:',
    redactAuditText(d.raw).trim()
  ]
  return lines.join('\n')
}
