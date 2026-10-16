/** PNG-5: one human cause and at most three clickable checks for a failed SSH connect. */

import { parseHopFailure } from './jump-chain'
import { noticeKind } from './product-error'

export type TroubleId =
  | 'refused'
  | 'timeout'
  | 'dns'
  | 'auth'
  | 'jump'
  | 'dropped'
  | 'unreachable'
  | 'generic'

export type TroubleStepId = 'host' | 'port' | 'net' | 'user' | 'key' | 'jump' | 'retry'

/** Clickable checks on the failure card. Not a stack trace and not a fourth toolbar button. */
export type TriageAction = 'edit' | 'keys' | 'retry'

export type TroublePlan = {
  id: TroubleId
  /** Legacy checklist ids kept for the earlier PNG-5 classifier. The card renders `actions`. */
  steps: TroubleStepId[]
  actions: TriageAction[]
  primary: 'retry' | 'edit' | 'keys' | 'jump'
}

const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*/i
const ERR_PREFIX = /^Error:\s*/i

function plan(
  id: TroubleId,
  steps: TroubleStepId[],
  actions: TriageAction[],
  primary: TroublePlan['primary']
): TroublePlan {
  return { id, steps, actions: actions.slice(0, 3), primary }
}

export function troubleshootConnection(raw: string): TroublePlan {
  const text = String(raw ?? '')
  if (parseHopFailure(text)) return plan('jump', ['jump', 'host', 'key', 'retry'], ['edit', 'retry'], 'jump')
  if (/ECONNREFUSED|Connection refused|没有在监听|连接被拒绝/i.test(text)) {
    return plan('refused', ['host', 'port', 'net', 'retry'], ['edit', 'retry'], 'edit')
  }
  if (/ETIMEDOUT|timed out|handshake|连接超时|超时/i.test(text)) {
    return plan('timeout', ['net', 'host', 'port', 'retry'], ['retry', 'edit'], 'retry')
  }
  if (/ENOTFOUND|getaddrinfo|找不到主机|Host not found/i.test(text)) {
    return plan('dns', ['host', 'net', 'retry'], ['edit', 'retry'], 'edit')
  }
  if (/EHOSTUNREACH|ENETUNREACH|EHOSTDOWN|No route to host|Host is unreachable|主机不可达|无法到达|网络不可达/i.test(text)) {
    return plan('unreachable', ['host', 'net', 'retry'], ['edit', 'retry'], 'edit')
  }
  const kind = noticeKind(text)
  if (kind === 'auth') return plan('auth', ['user', 'key', 'retry'], ['keys', 'edit', 'retry'], 'keys')
  if (kind === 'dropped') return plan('dropped', ['net', 'retry'], ['retry', 'edit'], 'retry')
  if (kind === 'unreachable') return plan('unreachable', ['host', 'port', 'net', 'retry'], ['edit', 'retry'], 'edit')
  return plan('generic', ['host', 'net', 'retry'], ['edit', 'retry'], 'edit')
}

/** The button that starts the next connect, or the edit that is the main fix. */
export function primaryAction(item: TroublePlan): TriageAction {
  if ((item.primary === 'retry' || item.primary === 'edit' || item.primary === 'keys') && item.actions.includes(item.primary)) {
    return item.primary
  }
  if (item.primary === 'jump' && item.actions.includes('edit')) return 'edit'
  return item.actions[0] ?? 'retry'
}

/** Primary first, then the other checks. Never more than three. */
export function orderedActions(item: TroublePlan): TriageAction[] {
  const first = primaryAction(item)
  const rest = item.actions.filter((action) => action !== first)
  return [first, ...rest].slice(0, 3)
}

/** PNG5-4: ignore another primary click while a connect is already in flight. */
export function acceptPrimaryAction(busy: boolean): boolean {
  return busy !== true
}

/** Engineer text for the collapsed block. IPC channel prefixes are peeled off. */
export function connectionTechnicalDetail(raw: string): string {
  let s = String(raw ?? '').trim()
  for (let i = 0; i < 6; i++) {
    const next = s.replace(IPC_PREFIX, '').replace(ERR_PREFIX, '').trim()
    if (next === s) break
    s = next
  }
  return s
}

/** Sidebar / connection-page card for SSH connect failures, not import or permission noise. */
export function showConnectionTrouble(kind: string, raw: string | null | undefined): boolean {
  const text = String(raw ?? '').trim()
  if (!text) return false
  if (kind === 'import' || kind === 'permission') return false
  if (troubleshootConnection(text).id === 'jump') return true
  if (kind === 'unreachable' || kind === 'auth' || kind === 'dropped') return true
  return troubleshootConnection(text).id !== 'generic'
}
