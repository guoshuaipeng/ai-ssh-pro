import AiConfigForm from './AiConfigForm'
import { tg } from '../lib/i18n'

type Props = {
  onClose: () => void
}

export default function AiConfigModal({ onClose }: Props) {
  return (
    <div className="workspace-panel workspace-panel--settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('ui.26')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose}>
            {tg('ui.27')}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings">
          <AiConfigForm />
        </div>
      </div>
    </div>
  )
}
