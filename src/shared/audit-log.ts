/** Local audit log. M1 stored alert.execute and danger; M2 adds the searchable table and playbook runs. */

export type AuditType = 'connect' | 'command' | 'file' | 'danger' | 'alert.execute' | 'playbook.run' | 'protection.change'

export type AuditOutcome = 'allowed' | 'blocked' | 'cancelled'

export type AuditSource = 'AI' | 'user' | 'terminal' | 'snippet' | 'batch' | 'broadcast' | 'playbook' | 'sftp'

export type AuditEvent = {
  id: string
  at: number
  type: AuditType
  host: string
  profileId?: string
  source?: AuditSource
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

const REDACT = [
  /\b(?:password|passwd|token|secret)\s*=\s*\S+/gi,
  /--password(?:=|\s+)\S+/gi,
  /-p'[^']*'/gi,
  /-p"[^"]*"/gi,
  /\bBearer\s+\S+/gi,
  /\bAKIA[0-9A-Z]{16}\b/g
]

export function redactAuditText(text: string): string {
  let out = text
  for (const re of REDACT) out = out.replace(re, '••••')
  return out
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
    detail: redactAuditText(event.detail).slice(0, 500)
  }
  const next = [row, ...loadAudit(store)].slice(0, MAX)
  store.setItem(AUDIT_LS_KEY, JSON.stringify(next))
  return row
}

export function filterAudit(
  list: AuditEvent[],
  q: { host?: string; type?: AuditType | ''; text?: string; since?: number; until?: number }
): AuditEvent[] {
  const text = (q.text ?? '').trim().toLowerCase()
  return list.filter((e) => {
    if (q.host && e.host !== q.host && e.profileId !== q.host) return false
    if (q.type && e.type !== q.type) return false
    if (q.since != null && e.at < q.since) return false
    if (q.until != null && e.at > q.until) return false
    if (text && !`${e.host} ${e.type} ${e.detail} ${e.outcome} ${e.source ?? ''}`.toLowerCase().includes(text)) return false
    return true
  })
}

export function clearAudit(store: Store = globalThis.localStorage): void {
  store.setItem(AUDIT_LS_KEY, '[]')
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function auditToCsv(rows: AuditEvent[]): string {
  const head = ['at', 'host', 'type', 'source', 'outcome', 'detail']
  const lines = [head.join(',')]
  for (const e of rows) {
    lines.push([new Date(e.at).toISOString(), e.host, e.type, e.source ?? '', e.outcome, e.detail].map(csvCell).join(','))
  }
  return lines.join('\n')
}

export function auditToJsonl(rows: AuditEvent[]): string {
  return rows.map((e) => JSON.stringify(e)).join('\n')
}
