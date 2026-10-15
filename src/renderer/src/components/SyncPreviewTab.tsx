import type { SyncRow } from '@shared/folder-sync'
import { tg } from '../lib/i18n'

export type SyncPreviewPlan = {
  direction: 'upload' | 'download'
  localRoot: string
  remoteRoot: string
  rows: SyncRow[]
  deleteExtra: boolean
  sessionId?: string
  profileId?: string
}

export default function SyncPreviewTab({
  plan,
  onStart,
  onClose
}: {
  plan: SyncPreviewPlan
  onStart: (plan: SyncPreviewPlan) => void
  onClose: () => void
}) {
  return (
    <div className="workspace-panel" data-testid="sync-preview">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('m2.syncPreview')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" className="primary" onClick={() => onStart(plan)}>{tg('m2.startSync')}</button>
          <button type="button" onClick={onClose}>{tg('common.close')}</button>
        </div>
      </div>
      <div className="workspace-panel-body">
        <p className="l7-meta">{plan.localRoot} → {plan.remoteRoot} · {plan.rows.length}</p>
        <table className="audit-table">
          <tbody>
            {plan.rows.slice(0, 200).map((row) => (
              <tr key={row.rel}>
                <td>{row.kind}</td>
                <td>{row.rel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
