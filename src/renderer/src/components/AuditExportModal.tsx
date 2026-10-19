import { useMemo, useState } from 'react'
import {
  AUDIT_EXPORT_TYPES,
  auditExportCanSave,
  auditExportFileName,
  normalizeExportType,
  renderAuditCompliance,
  selectAuditExport,
  type AuditExportFormat,
  type AuditExportRange,
  type AuditExportSeed
} from '@shared/audit-export'
import type { AuditEvent } from '@shared/audit-log'
import { useI18n } from '../lib/i18n'
import { showToast } from '../lib/toast'
import Modal from './Modal'
import Button from './ui/Button'

const RANGES: AuditExportRange[] = ['today', '7d', '30d', 'custom']

export default function AuditExportModal({
  open,
  events,
  seed,
  onClose
}: {
  open: boolean
  events: AuditEvent[]
  seed?: AuditExportSeed
  onClose: () => void
}) {
  const { t } = useI18n()
  const [range, setRange] = useState<AuditExportRange>(seed?.range ?? '7d')
  const [since, setSince] = useState(seed?.since ?? '')
  const [until, setUntil] = useState(seed?.until ?? '')
  const [host, setHost] = useState(seed?.host ?? '')
  const [type, setType] = useState(seed?.type ?? '')
  const [format, setFormat] = useState<AuditExportFormat>('csv')
  const rows = useMemo(
    () => selectAuditExport(events, { range, since, until, host, type, now: Date.now() }),
    [events, range, since, until, host, type]
  )
  const count = rows.length
  const canSave = auditExportCanSave(count)
  const hosts = useMemo(() => {
    const names = new Set<string>()
    for (const event of events) if (event.host) names.add(event.host)
    if (host) names.add(host)
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [events, host])
  const rangeLabel = (id: AuditExportRange) => t(id === 'today' ? 's1b.today' : id === '7d' ? 's1b.d7' : id === '30d' ? 's1b.d30' : 's1b.custom')
  const typeLabel = (value: string) => {
    if (value === 'connect') return t('s1b.type.connect')
    if (value === 'command') return t('s1b.type.command')
    if (value === 'file') return t('s1b.type.file')
    if (value === 'danger') return t('s1b.type.danger')
    return value
  }

  const save = async () => {
    if (!canSave) return
    const body = renderAuditCompliance(rows, format, {
      title: t('s1b.title'),
      redactNote: t('s1b.redactNote'),
      time: t('s1b.col.time'),
      host: t('s1b.col.host'),
      type: t('s1b.col.type'),
      body: t('s1b.col.body'),
      source: t('s1b.col.source'),
      result: t('s1b.col.result'),
      typeLabel
    })
    try {
      const file = await window.aiss.files.saveText(auditExportFileName(format), body)
      if (!file) return
      showToast(t('s1b.exported', { file }), {
        action: { label: t('s1b.openFolder'), run: () => void window.aiss.files.reveal(file) }
      })
      onClose()
    } catch (err) {
      showToast(t('s1b.fail', { msg: err instanceof Error ? err.message : String(err) }), { kind: 'error' })
    }
  }

  return (
    <Modal open={open} title={t('s1b.title')} onClose={onClose} width={420} testId="s1b-export">
      <div className="s1b-export" data-testid="s1b-export">
        <div className="s1b-field">{t('s1b.range')}</div>
        <div className="s1b-range" role="radiogroup" aria-label={t('s1b.range')} data-testid="s1b-range">
          {RANGES.map((id) => (
            <button key={id} type="button" className={range === id ? 'is-on' : undefined} aria-pressed={range === id} onClick={() => setRange(id)}>
              {rangeLabel(id)}
            </button>
          ))}
        </div>
        {range === 'custom' ? (
          <div className="s1b-dates">
            <input type="date" value={since} aria-label={t('s1b.since')} onChange={(e) => setSince(e.target.value)} />
            <input type="date" value={until} aria-label={t('s1b.until')} onChange={(e) => setUntil(e.target.value)} />
          </div>
        ) : null}
        <div className="s1b-filters" data-testid="s1b-filters">
          <label>
            <span>{t('s1b.host')}</span>
            <select aria-label={t('s1b.host')} value={host} onChange={(e) => setHost(e.target.value)}>
              <option value="">{t('s1b.allHosts')}</option>
              {hosts.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('s1b.action')}</span>
            <select aria-label={t('s1b.action')} value={normalizeExportType(type) || type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t('s1b.allActions')}</option>
              {AUDIT_EXPORT_TYPES.map((id) => (
                <option key={id} value={id}>
                  {typeLabel(id)}
                </option>
              ))}
              {type && !normalizeExportType(type) ? <option value={type}>{type}</option> : null}
            </select>
          </label>
          <span className="s1b-count" data-testid="s1b-count">
            {t('s1b.count', { n: count })}
          </span>
        </div>
        <div className="s1b-format" role="radiogroup" aria-label={t('s1b.format')}>
          <label>
            <input type="radio" name="s1b-format" checked={format === 'csv'} onChange={() => setFormat('csv')} />
            {t('s1b.csv')}
          </label>
          <label>
            <input type="radio" name="s1b-format" checked={format === 'markdown'} onChange={() => setFormat('markdown')} />
            {t('s1b.md')}
          </label>
        </div>
        <p className="s1b-note">{t('s1b.redactNote')}</p>
        {canSave ? null : (
          <p className="s1b-empty" data-testid="s1b-empty">
            {t('s1b.empty')}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <Button variant="primary" data-testid="s1b-save" disabled={!canSave} onClick={() => void save()}>
            {t('s1b.exportN', { n: count })}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
