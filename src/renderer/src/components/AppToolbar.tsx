import { useCallback, useEffect, useState } from 'react'
import TitlebarMenus, { type TitlebarMenuAction } from './TitlebarMenus'
import {
  isLightUiTheme,
  isUiThemeId,
  loadUiThemeId,
  toggleLightDarkTheme,
  type UiThemeId
} from '../lib/ui-themes'

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

function UpdateIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 2.5v7.2M5.2 7.2 8 10l2.8-2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 11.5v1.2A1.3 1.3 0 0 0 4.3 14h7.4A1.3 1.3 0 0 0 13 12.7v-1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.58c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  )
}

/** 当前是深色时显示太阳（点一下切浅色）；浅色时显示月亮 */
function ThemeToggleIcon({ light }: { light: boolean }) {
  if (light) {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
        <path
          fill="currentColor"
          d="M6.05 1.6a.75.75 0 0 1 .9-.1 5.5 5.5 0 1 0 7.55 7.55.75.75 0 0 1 1.05.9A7 7 0 1 1 5.15 1.5a.75.75 0 0 1 .9.1z"
        />
      </svg>
    )
  }
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path
        d="M8 1.4v1.6M8 13v1.6M1.4 8h1.6M13 8h1.6M3.3 3.3l1.1 1.1M11.6 11.6l1.1 1.1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 合并标题栏：品牌 + 菜单 + 更新/GitHub/主题 + 布局开关 */
export default function AppToolbar({
  onMenuAction,
  onToggleSidebar,
  onToggleMain,
  onToggleAi,
  showSidebar = true,
  showMain = true,
  showAi = true
}: Props) {
  const [version, setVersion] = useState('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [themeId, setThemeId] = useState<UiThemeId>(() => loadUiThemeId())
  const lightMode = isLightUiTheme(themeId)

  useEffect(() => {
    let cancelled = false
    void window.aiss.app
      .getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onTheme = (e: Event) => {
      const id = (e as CustomEvent).detail
      if (isUiThemeId(id)) setThemeId(id)
    }
    window.addEventListener('aiss-ui-theme', onTheme)
    return () => window.removeEventListener('aiss-ui-theme', onTheme)
  }, [])

  const onOpenGithub = useCallback(() => {
    void window.aiss.app.openGithub().catch((e) => {
      window.alert(e instanceof Error ? e.message : String(e))
    })
  }, [])

  const onToggleTheme = useCallback(() => {
    setThemeId(toggleLightDarkTheme(themeId))
  }, [themeId])

  const onCheckUpdate = useCallback(async () => {
    if (checkingUpdate) return
    setCheckingUpdate(true)
    try {
      const result = await window.aiss.app.checkUpdate()
      if (result.status === 'available') {
        const openDownload = window.confirm(
          `${result.message}\n\n点击「确定」打开下载页并安装新版本。`
        )
        if (openDownload) {
          const url = result.downloadUrl || result.releaseUrl
          if (url) await window.aiss.app.openExternal(url)
        }
        return
      }
      if (result.status === 'noRelease') {
        const openRepo = window.confirm(`${result.message}\n\n是否打开 GitHub Releases 页面？`)
        if (openRepo && result.releaseUrl) await window.aiss.app.openExternal(result.releaseUrl)
        return
      }
      if (result.status === 'error') {
        const openRepo = window.confirm(`检查更新失败：${result.message}\n\n是否打开 GitHub 仓库？`)
        if (openRepo) await window.aiss.app.openGithub()
        return
      }
      window.alert(result.message)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    } finally {
      setCheckingUpdate(false)
    }
  }, [checkingUpdate])

  return (
    <header className="app-titlebar">
      <div className="app-titlebar-drag">
        <span className="app-toolbar-brand">AI-SSH-Pro</span>
        <TitlebarMenus onAction={onMenuAction} />
      </div>
      <div className="app-titlebar-spacer" />
      <div className="app-titlebar-corner" role="group" aria-label="应用操作">
        <button
          type="button"
          className="titlebar-icon-btn"
          title={version ? `检查更新（当前 v${version}）` : '检查更新'}
          aria-label="检查更新"
          disabled={checkingUpdate}
          onClick={() => void onCheckUpdate()}
        >
          <UpdateIcon />
          <span>{checkingUpdate ? '检查中…' : '更新'}</span>
        </button>
        <button
          type="button"
          className="titlebar-icon-btn"
          title="在浏览器打开 GitHub 仓库"
          aria-label="打开 GitHub"
          onClick={onOpenGithub}
        >
          <GithubIcon />
          <span>GitHub</span>
        </button>
        <button
          type="button"
          className="titlebar-icon-btn"
          title={lightMode ? '切换为深色模式' : '切换为浅色模式'}
          aria-label={lightMode ? '切换为深色模式' : '切换为浅色模式'}
          aria-pressed={lightMode}
          onClick={onToggleTheme}
        >
          <ThemeToggleIcon light={lightMode} />
          <span>{lightMode ? '深色' : '浅色'}</span>
        </button>
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
      </div>
    </header>
  )
}
