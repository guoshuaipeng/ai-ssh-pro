import AiConfigForm from './AiConfigForm'

type Props = {
  onClose: () => void
}

export default function AiConfigModal({ onClose }: Props) {
  return (
    <div className="workspace-panel workspace-panel--settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">AI 配置</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose}>
            关闭
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
