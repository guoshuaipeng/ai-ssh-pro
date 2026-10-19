import AiConfigForm from './AiConfigForm'
import { tg } from '../lib/i18n'
import PanelHeader from './ui/PanelHeader'

type Props = {
  onClose: () => void
}

export default function AiConfigModal({ onClose }: Props) {
  return (
    <div className="workspace-panel workspace-panel--settings">
      <PanelHeader
        title={tg('ui.26')}
        actions={
          <>
            <button type="button" onClick={onClose}>
              {tg('ui.27')}
            </button>
          </>
        }
      />
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings">
          <AiConfigForm />
        </div>
      </div>
    </div>
  )
}
