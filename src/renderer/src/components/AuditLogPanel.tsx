import { useMemo, useState } from 'react'
import { filterAudit, type AuditEvent, type AuditType } from '@shared/audit-log'
import { useI18n } from '../lib/i18n'

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
  const rows = useMemo(() => filterAudit(events, { host, type, text }), [events, host, type, text])
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
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('l2.search')} aria-label={t('l2.search')} />
        <label className="l4-check">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          {t('l4.audit')}
        </label>
      </div>
      <div className="workspace-panel-body audit-table-wrap">
        {rows.length === 0 ? (
          <p className="l7-muted">{t('l4.auditEmpty')}</p>
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
