import { useMemo, useState } from 'react'
import { auditToCsv, auditToJsonl, filterAudit, type AuditEvent, type AuditType } from '@shared/audit-log'
import { useI18n } from '../lib/i18n'
import EmptyState from './EmptyState'
import Icon from './Icon'

export default function AuditLogPanel({
  events,
  host,
  enabled,
  onToggle,
  onClose
}: {
  events: AuditEvent[]
  host?: string
  enabled: boolean
  onToggle: (on: boolean) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [type, setType] = useState<AuditType | ''>('')
  const [since, setSince] = useState('')
  const [until, setUntil] = useState('')
  const rows = useMemo(
    () =>
      filterAudit(events, {
        host,
        type,
        text,
        since: since ? new Date(since).getTime() : undefined,
        until: until ? new Date(until).getTime() : undefined
      }),
    [events, host, type, text, since, until]
  )
  return (
    <div className="workspace-panel" data-testid="audit-log">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          {t('l4.auditTitle')}
          {host ? <span className="l7-meta">{host}</span> : null}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
      {!enabled ? (
        <div className="l7-mute" data-testid="audit-off">
          <span>{t('l4.auditOff')}</span>
          <button type="button" onClick={() => onToggle(true)}>
            {t('l4.auditEnable')}
          </button>
        </div>
      ) : null}
      <div className="l2-filters">
        <select aria-label={t('l2.rule')} value={type} onChange={(e) => setType(e.target.value as AuditType | '')}>
          <option value="">{t('l2.all')}</option>
          <option value="alert.execute">alert.execute</option>
          <option value="danger">danger</option>
          <option value="playbook.run">playbook.run</option>
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('m2.search')} aria-label={t('m2.search')} />
        <input type="date" value={since} onChange={(e) => setSince(e.target.value)} aria-label={t('m2.since')} />
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} aria-label={t('m2.until')} />
        <button type="button" onClick={() => void window.aiss.files.saveText('audit.csv', auditToCsv(rows))}>{t('m2.exportCsv')}</button>
        <button type="button" onClick={() => void window.aiss.files.saveText('audit.jsonl', auditToJsonl(rows))}>{t('m2.exportJsonl')}</button>
        <label className="l4-check">
          <input id="audit-enable" type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          {t('l4.audit')}
        </label>
      </div>
      <div className="workspace-panel-body audit-table-wrap">
        {rows.length === 0 ? (
          <EmptyState
            testId="audit-empty"
            icon={<Icon name="scroll-text" size={48} strokeWidth={1.5} />}
            title={t('pf4.auditTitle')}
            desc={t('pf4.auditDesc')}
            primary={{
              label: t('pf4.auditCta'),
              onClick: () => document.getElementById('audit-enable')?.focus()
            }}
          />
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>{t('l4.colTime')}</th>
                <th>{t('l4.colType')}</th>
                <th>{t('l2.host')}</th>
                <th>{t('l4.colOutcome')}</th>
                <th>{t('l4.colDetail')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString()}</td>
                  <td>{e.type}</td>
                  <td title={e.host}>{e.host}</td>
                  <td>{e.outcome}</td>
                  <td title={e.detail}>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
