/** S1b: local compliance export. Redaction is mandatory; nothing here uploads or shares. */
import { filterAudit, redactAuditText, type AuditEvent, type AuditType } from './audit-log'

export const AUDIT_EXPORT_TYPES = ['connect', 'command', 'file', 'danger'] as const
export type AuditExportType = (typeof AUDIT_EXPORT_TYPES)[number]
export type AuditExportRange = 'today' | '7d' | '30d' | 'custom'
export type AuditExportFormat = 'csv' | 'markdown'

export type AuditExportSeed = {
  range?: AuditExportRange
  since?: string
  until?: string
  host?: string
  type?: string
}

export type AuditExportQuery = {
  range: AuditExportRange
  since?: string
  until?: string
  host?: string
  type?: string
  now?: number
}

export type AuditExportCopy = {
  title: string
  redactNote: string
  time: string
  host: string
  type: string
  body: string
  source: string
  result: string
  typeLabel: (type: string) => string
}

const DAY = 24 * 60 * 60 * 1000

let panelContext: AuditExportSeed | null = null

/** Latest filters from the open audit tab, so Ctrl+K can reuse them. */
export function setAuditExportContext(seed: AuditExportSeed | null): void {
  panelContext = seed
}

export function peekAuditExportContext(): AuditExportSeed | null {
  return panelContext
}

export function normalizeExportType(type?: string): AuditExportType | '' {
  return (AUDIT_EXPORT_TYPES as readonly string[]).includes(type ?? '') ? (type as AuditExportType) : ''
}

export function auditExportCanSave(count: number): boolean {
  return count > 0
}

function startOfLocalDay(ymd: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return undefined
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime()
  return Number.isFinite(at) ? at : undefined
}

export function auditWindowBounds(query: Pick<AuditExportQuery, 'range' | 'since' | 'until' | 'now'>, now = query.now ?? Date.now()): {
  since?: number
  until?: number
} {
  if (query.range === 'custom') {
    return { since: query.since ? startOfLocalDay(query.since) : undefined, until: query.until ? endOfLocalDay(query.until) : undefined }
  }
  if (query.range === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { since: start.getTime(), until: now }
  }
  const days = query.range === '7d' ? 7 : 30
  return { since: now - days * DAY, until: now }
}

function endOfLocalDay(ymd: string): number | undefined {
  const start = startOfLocalDay(ymd)
  if (start == null) return undefined
  return start + DAY - 1
}

export function selectAuditExport(events: AuditEvent[], query: AuditExportQuery): AuditEvent[] {
  const bounds = auditWindowBounds(query, query.now ?? Date.now())
  const type = (query.type ?? '') as AuditType | ''
  return filterAudit(events, {
    host: query.host?.trim() || undefined,
    type,
    since: bounds.since,
    until: bounds.until
  })
}

function cleanField(value: string): string {
  return redactAuditText(value).replace(/\r?\n/g, ' ').trim()
}

function csvCell(value: string): string {
  const clean = cleanField(value)
  if (/[",\n]/.test(clean)) return `"${clean.replace(/"/g, '""')}"`
  return clean
}

function mdCell(value: string): string {
  return cleanField(value).replace(/\|/g, '\\|')
}

export function auditExportFileName(format: AuditExportFormat, now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `audit-${y}-${m}-${d}.${format === 'csv' ? 'csv' : 'md'}`
}

function rowCells(event: AuditEvent, copy: AuditExportCopy): string[] {
  return [
    new Date(event.at).toISOString(),
    event.host,
    copy.typeLabel(event.type),
    event.detail,
    event.source ?? '',
    event.outcome
  ]
}

/** CSV or Markdown for a compliance handoff. Every text field is redacted again. */
export function renderAuditCompliance(rows: AuditEvent[], format: AuditExportFormat, copy: AuditExportCopy): string {
  const sorted = [...rows].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  const headers = [copy.time, copy.host, copy.type, copy.body, copy.source, copy.result]
  if (format === 'csv') {
    const lines = [headers.map(csvCell).join(',')]
    for (const event of sorted) lines.push(rowCells(event, copy).map(csvCell).join(','))
    return redactAuditText(lines.join('\n'))
  }
  const head = `| ${headers.map(mdCell).join(' | ')} |`
  const rule = `| ${headers.map(() => '---').join(' | ')} |`
  const body = sorted.map((event) => `| ${rowCells(event, copy).map(mdCell).join(' | ')} |`)
  return redactAuditText([`# ${cleanField(copy.title)}`, '', cleanField(copy.redactNote), '', head, rule, ...body].join('\n'))
}
