import TitlebarMenus, { type TitlebarMenuAction } from './TitlebarMenus'

type Props = {
  onMenuAction: (action: TitlebarMenuAction) => void
  onToggleSidebar?: () => void
  onToggleMain?: () => void
  onToggleAi?: () => void
  showSidebar?: boolean
  showMain?: boolean
  showAi?: boolean
}

function LayoutToggleIcon({ kind }: { kind: 'sidebar' | 'main' | 'ai' }) {
  if (kind === 'sidebar') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 2.5v11" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  if (kind === 'ai') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10.5 2.5v11" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 2.5v11M10.5 2.5v11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** 合并标题栏：品牌 + 菜单 + 布局开关 */
export default function AppToolbar({
  onMenuAction,
  onToggleSidebar,
  onToggleMain,
  onToggleAi,
  showSidebar = true,
  showMain = true,
  showAi = true
}: Props) {
  return (
    <header className="app-titlebar">
      <div className="app-titlebar-drag">
        <span className="app-toolbar-brand">AI-SSH-Pro</span>
        <TitlebarMenus onAction={onMenuAction} />
      </div>
      <div className="app-titlebar-spacer" />
      <div className="app-toolbar-layout" role="group" aria-label="布局显隐">
        {onToggleSidebar ? (
          <button
            type="button"
            className={`layout-toggle-btn ${showSidebar ? 'is-on' : ''}`}
            title={showSidebar ? '隐藏左侧会话栏' : '显示左侧会话栏'}
            aria-pressed={showSidebar}
            onClick={onToggleSidebar}
          >
            <LayoutToggleIcon kind="sidebar" />
          </button>
        ) : null}
        {onToggleMain ? (
          <button
            type="button"
            className={`layout-toggle-btn ${showMain ? 'is-on' : ''}`}
            title={showMain ? '隐藏中间终端区' : '显示中间终端区'}
            aria-pressed={showMain}
            onClick={onToggleMain}
          >
            <LayoutToggleIcon kind="main" />
          </button>
        ) : null}
        {onToggleAi ? (
          <button
            type="button"
            className={`layout-toggle-btn ${showAi ? 'is-on' : ''}`}
            title={showAi ? '隐藏右侧 AI 面板' : '显示右侧 AI 面板'}
            aria-pressed={showAi}
            onClick={onToggleAi}
          >
            <LayoutToggleIcon kind="ai" />
          </button>
        ) : null}
      </div>
    </header>
  )
}
