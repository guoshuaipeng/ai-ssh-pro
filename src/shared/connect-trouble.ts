/** PNG-5: a short checklist for a failed SSH connect. Human steps, not a stack trace. */

import { parseHopFailure } from './jump-chain'
import { noticeKind } from './product-error'

export type TroubleId = 'refused' | 'timeout' | 'dns' | 'auth' | 'jump' | 'dropped' | 'generic'

export type TroubleStepId = 'host' | 'port' | 'net' | 'user' | 'key' | 'jump' | 'retry'

export type TroublePlan = {
  id: TroubleId
  steps: TroubleStepId[]
  primary: 'retry' | 'edit' | 'keys' | 'jump'
}

export function troubleshootConnection(raw: string): TroublePlan {
  const text = String(raw ?? '')
  if (parseHopFailure(text)) return { id: 'jump', steps: ['jump', 'host', 'key', 'retry'], primary: 'jump' }
  if (/ECONNREFUSED|Connection refused|没有在监听|连接被拒绝/i.test(text)) {
    return { id: 'refused', steps: ['host', 'port', 'net', 'retry'], primary: 'edit' }
  }
  if (/ETIMEDOUT|timed out|handshake|连接超时|超时/i.test(text)) {
    return { id: 'timeout', steps: ['net', 'host', 'port', 'retry'], primary: 'retry' }
  }
  if (/ENOTFOUND|getaddrinfo|找不到主机|Host not found/i.test(text)) {
    return { id: 'dns', steps: ['host', 'net', 'retry'], primary: 'edit' }
  }
  const kind = noticeKind(text)
  if (kind === 'auth') return { id: 'auth', steps: ['user', 'key', 'retry'], primary: 'keys' }
  if (kind === 'dropped') return { id: 'dropped', steps: ['net', 'retry'], primary: 'retry' }
  if (kind === 'unreachable') return { id: 'timeout', steps: ['host', 'port', 'net', 'retry'], primary: 'retry' }
  return { id: 'generic', steps: ['host', 'net', 'retry'], primary: 'edit' }
}

/** Sidebar checklist only for connection failures, not import or permission noise. */
export function showConnectionTrouble(kind: string, raw: string | null | undefined): boolean {
  const text = String(raw ?? '').trim()
  if (!text) return false
  if (troubleshootConnection(text).id === 'jump') return true
  return kind === 'unreachable' || kind === 'auth' || kind === 'dropped'
}
