/** S1 slice for M1: persist alert.execute and danger locally. Full table UI can grow later. */

export type AuditType = 'alert.execute' | 'danger' | 'playbook.run' | 'protection.change'

export type AuditOutcome = 'allowed' | 'blocked' | 'cancelled'

export type AuditEvent = {
  id: string
  at: number
  type: AuditType
  host: string
  profileId?: string
  source?: 'AI' | 'user'
  outcome: AuditOutcome
  detail: string
}

export const AUDIT_LS_KEY = 'aiss.audit.v1'
export const AUDIT_ENABLED_KEY = 'aiss.audit.enabled'
const MAX = 500

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function auditEnabled(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  return store.getItem(AUDIT_ENABLED_KEY) !== '0'
}

export function setAuditEnabled(on: boolean, store: Store = globalThis.localStorage): void {
  store.setItem(AUDIT_ENABLED_KEY, on ? '1' : '0')
}

export function loadAudit(store: Pick<Storage, 'getItem'> = globalThis.localStorage): AuditEvent[] {
  try {
    const raw = store.getItem(AUDIT_LS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as AuditEvent[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function appendAudit(
  event: Omit<AuditEvent, 'id' | 'at'> & { at?: number; id?: string },
  store: Store = globalThis.localStorage,
  now = Date.now()
): AuditEvent | null {
  if (!auditEnabled(store)) return null
  const row: AuditEvent = {
    id: event.id ?? `aud-${now}-${Math.random().toString(36).slice(2, 8)}`,
    at: event.at ?? now,
    type: event.type,
    host: event.host,
    profileId: event.profileId,
    source: event.source,
    outcome: event.outcome,
    detail: event.detail.slice(0, 500)
  }
  const next = [row, ...loadAudit(store)].slice(0, MAX)
  store.setItem(AUDIT_LS_KEY, JSON.stringify(next))
  return row
}

export function filterAudit(list: AuditEvent[], q: { host?: string; type?: AuditType | ''; text?: string }): AuditEvent[] {
  const text = (q.text ?? '').trim().toLowerCase()
  return list.filter((e) => {
    if (q.host && e.host !== q.host && e.profileId !== q.host) return false
    if (q.type && e.type !== q.type) return false
    if (text && !`${e.host} ${e.type} ${e.detail} ${e.outcome}`.toLowerCase().includes(text)) return false
    return true
  })
}
