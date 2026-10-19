import { useState } from 'react'
import type { ImportPolicy, ImportPreviewModel } from '@shared/import-preview'
import { publicRows } from '@shared/import-preview'
import { useI18n } from '../lib/i18n'

type Props = {
  model: ImportPreviewModel
  onClose: () => void
  onApply: (policy: ImportPolicy) => void
}

/** N2: groups, host count, and skip / overwrite / copy. Secrets are not rendered. */
export default function ImportPreviewPanel({ model, onClose, onApply }: Props) {
  const { t } = useI18n()
  const [policy, setPolicy] = useState<ImportPolicy>('skip')
  const rows = publicRows(model)
  return (
    <div className="workspace-panel" data-testid="import-preview">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{t('n2.title')}</h2>
        <div className="workspace-panel-actions">
          <span className="n2-stat">{t('n2.hosts', { n: model.hostCount })}</span>
          <span className="n2-stat">{t('n2.groups', { n: model.groups.length })}</span>
          <span className="n2-stat">{t('n2.conflicts', { n: model.conflictCount })}</span>
        </div>
      </div>
      <div className="workspace-panel-body">
        <div className="n2-policy" role="radiogroup" aria-label={t('n2.title')}>
          {(
            [
              ['skip', 'n2.skip'],
              ['overwrite', 'n2.overwrite'],
              ['copy', 'n2.copy']
            ] as const
          ).map(([id, key]) => (
            <label key={id}>
              <input type="radio" name="import-policy" checked={policy === id} onChange={() => setPolicy(id)} />
              {t(key)}
            </label>
          ))}
        </div>
        {model.notes.length ? <p className="workspace-panel-hint">{model.notes.join(' ')}</p> : null}
        {rows.length === 0 ? (
          <p className="o2-empty">{t('n2.empty')}</p>
        ) : (
          <div className="st-table-wrap">
            <table className="st-table n2-table">
              <thead>
                <tr>
                  <th>{t('n2.colGroup')}</th>
                  <th>{t('sftp.colName')}</th>
                  <th>{t('n2.host')}</th>
                  <th>{t('n2.colAuth')}</th>
                  <th>{t('n2.colConflict')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.host}:${r.port}:${r.username}:${i}`} data-conflict={r.conflict ? '1' : '0'}>
                    <td>{r.group || t('n2.groupNone')}</td>
                    <td>{r.label}</td>
                    <td>
                      {r.username}@{r.host}:{r.port}
                      {r.hasJump ? <span className="n2-tag">{t('n2.tagJump')}</span> : null}
                      {r.forwardCount ? <span className="n2-tag">{t('n2.tagFwd', { n: r.forwardCount })}</span> : null}
                    </td>
                    <td>{r.keyName ? t('n2.authKey', { name: r.keyName }) : t('n2.authPassword')}</td>
                    <td>{r.conflict ? t('n2.conflictYes') : t('n2.conflictNo')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('dlg.cancel')}
          </button>
          <button type="button" className="primary" disabled={!rows.length} onClick={() => onApply(policy)} data-testid="import-apply">
            {t('n2.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
