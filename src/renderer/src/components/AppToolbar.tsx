type Props = {
  onOpenConnection: () => void
  onOpenAi: () => void
}

export default function AppToolbar({ onOpenConnection, onOpenAi }: Props) {
  return (
    <header className="app-toolbar">
      <span className="app-toolbar-brand">AI-SSH-Pro</span>
      <div className="app-toolbar-actions">
        <button type="button" onClick={onOpenConnection}>
          新建连接
        </button>
        <button type="button" onClick={onOpenAi}>
          AI 配置
        </button>
      </div>
      <span className="app-toolbar-hint">菜单：会话 → 新建连接 / AI 配置</span>
    </header>
  )
}
