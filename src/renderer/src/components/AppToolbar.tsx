import { useCallback, useEffect, useRef, useState } from 'react'
import type { RecentConnection } from '@shared/workspace-features'
import TitlebarMenus, { type TitlebarMenuAction } from './TitlebarMenus'
import RecentConnections from './RecentConnections'
import {
  isLightUiTheme,
  isUiThemeId,
  loadUiThemeId,
  toggleLightDarkTheme,
  type UiThemeId
} from '../lib/ui-themes'
import { useI18n, type MessageKey } from '../lib/i18n'
import { keysFor } from '@shared/keymap'
import type { IconName } from '@shared/icon-registry'
import Icon, { Twist } from './Icon'

type Props = {
  onMenuAction: (action: TitlebarMenuAction) => void
  onToggleSidebar?: () => void
  onToggleMain?: () => void
  onToggleAi?: () => void
  showSidebar?: boolean
  showMain?: boolean
  showAi?: boolean
  onQuickConnect?: (row: RecentConnection) => void
  /** checked state for toggle menu items */
  toggles?: Partial<Record<TitlebarMenuAction, boolean>>
  /** greyed menu items (still show a tooltip) */
  disabled?: Partial<Record<TitlebarMenuAction, boolean>>
  hints?: Partial<Record<TitlebarMenuAction, string | undefined>>
  /** an SSH session is connected (ops buttons look disabled otherwise) */
  hasSession?: boolean
  /** app version (V1) */
  version?: string
  isDev?: boolean
  /** newer version found by the update check (V2) */
  updateVersion?: string | null
  onOpenUpdate?: () => void
}

/** Ops group buttons (UX-04): icon, label key, needs a session */
/** UX-15 minimal default ops: monitor / toolbox / SFTP */
const OPS_BUTTONS: ReadonlyArray<{ id: TitlebarMenuAction; icon: IconName; label: MessageKey; title: MessageKey; needsSession: boolean }> = [
  { id: 'resourceMonitor', icon: 'activity', label: 'toolbar.monitor', title: 'toolbar.monitorTitle', needsSession: true },
  { id: 'serverTools', icon: 'wrench', label: 'toolbar.toolbox', title: 'toolbar.toolboxTitle', needsSession: true },
  { id: 'sftp', icon: 'folder', label: 'toolbar.sftp', title: 'toolbar.sftpTitle', needsSession: true }
]

function LayoutToggleIcon({ kind }: { kind: 'sidebar' | 'main' | 'ai' }) {
  if (kind === 'sidebar') {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5.5 2.5v11" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  if (kind === 'ai') {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M10.5 2.5v11" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 2.5v11M10.5 2.5v11" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/** 标题栏：品牌+版本 + 菜单 ｜ 新建/最近 ｜ 运维工具 ｜ 搜索/更多 ｜ 布局开关（UX-04） */
export default function AppToolbar({
  onMenuAction,
  onToggleSidebar,
  onToggleMain,
  onToggleAi,
  showSidebar = true,
  showMain = true,
  showAi = true,
  onQuickConnect,
  toggles,
  disabled,
  hints,
  hasSession = false,
  version = '',
  isDev = false,
  updateVersion,
  onOpenUpdate
}: Props) {
  const { t, locale, setLocale } = useI18n()
  const [recentOpen, setRecentOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const recentRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const [themeId, setThemeId] = useState<UiThemeId>(() => loadUiThemeId())
  const lightMode = isLightUiTheme(themeId)
  const versionText = version ? `v${version}${isDev ? '-dev' : ''}` : ''
  const headerRef = useRef<HTMLElement>(null)
  const [compactLevel, setCompactLevel] = useState(0) // UX-17: 0..4 stash steps
  const [autoIcon, setAutoIcon] = useState(() => localStorage.getItem('aiss.toolbar.autoIcon') !== '0')
  const [hamburgerOpen, setHamburgerOpen] = useState(false)

  useEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let timer: number | null = null
    const measure = () => {
      if (localStorage.getItem('aiss.toolbar.autoIcon') === '0') {
        setCompactLevel(0)
        return
      }
      const w = el.clientWidth
      // Reference widths from UX-17; ResizeObserver measured, not hard breakpoints alone
      let level = 0
      if (w < 1366) level = 1
      if (w < 1280) level = 2
      if (w < 1100) level = 3
      if (w < 1024) level = 4
      setCompactLevel(level)
    }
    const ro = new ResizeObserver(() => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(measure, 100)
    })
    ro.observe(el)
    measure()
    const onPref = () => measure()
    window.addEventListener('aiss-toolbar-auto-icon', onPref)
    return () => {
      ro.disconnect()
      window.removeEventListener('aiss-toolbar-auto-icon', onPref)
      if (timer) window.clearTimeout(timer)
    }
  }, [autoIcon])

  useEffect(() => {
    const onTheme = (e: Event) => {
      const id = (e as CustomEvent).detail
      if (isUiThemeId(id)) setThemeId(id)
    }
    window.addEventListener('aiss-ui-theme', onTheme)
    const onIcon = () => setAutoIcon(localStorage.getItem('aiss.toolbar.autoIcon') !== '0')
    window.addEventListener('aiss-toolbar-auto-icon', onIcon)
    return () => {
      window.removeEventListener('aiss-ui-theme', onTheme)
      window.removeEventListener('aiss-toolbar-auto-icon', onIcon)
    }
  }, [])

  useEffect(() => {
    if (!recentOpen && !moreOpen) return
    const onDoc = (e: MouseEvent) => {
      const n = e.target as Node
      if (!recentRef.current?.contains(n)) setRecentOpen(false)
      if (!moreRef.current?.contains(n)) setMoreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRecentOpen(false)
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [recentOpen, moreOpen])

  const onToggleTheme = useCallback(() => {
    setThemeId(toggleLightDarkTheme(themeId))
  }, [themeId])

  const more = (fn: () => void) => () => {
    setMoreOpen(false)
    fn()
  }

  const hideVersion = compactLevel >= 1
  const iconOnlyTools = compactLevel >= 2
  const searchIconOnly = compactLevel >= 3
  const menusAsHamburger = compactLevel >= 4

  return (
    <header className={`app-titlebar titlebar-compact-${compactLevel}`} ref={headerRef} data-compact={compactLevel}>
      <div className="app-titlebar-drag">
        <span className="app-toolbar-brand" title={versionText ? `AI-SSH-Pro ${versionText}` : 'AI-SSH-Pro'}>AI-SSH-Pro</span>
        {versionText && !hideVersion ? (
          <button
            type="button"
            className="app-toolbar-version"
            data-testid="titlebar-version"
            title={t('ver.tooltip', { version: versionText.slice(1) })}
            onClick={() => onMenuAction('whatsNew')}
          >
            {versionText}
          </button>
        ) : null}
        {updateVersion ? (
          <button type="button" className="app-toolbar-update-badge" data-testid="update-badge" onClick={onOpenUpdate}>
            <span className="app-toolbar-update-dot" aria-hidden />
            {t('upd.badge', { version: updateVersion })}
          </button>
        ) : null}
        {menusAsHamburger ? (
          <div className="titlebar-hamburger-wrap">
            <button
              type="button"
              className="titlebar-icon-btn"
              title={t('ux17.menu')}
              aria-label={t('ux17.menu')}
              aria-expanded={hamburgerOpen}
              onClick={() => setHamburgerOpen((v) => !v)}
            >
              <Icon name="menu" />
            </button>
            {hamburgerOpen ? (
              <div className="titlebar-hamburger-menu" role="menu">
                <TitlebarMenus
                  onAction={(a) => {
                    setHamburgerOpen(false)
                    onMenuAction(a)
                  }}
                  toggles={toggles}
                  disabled={disabled}
                  hints={hints}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <TitlebarMenus onAction={onMenuAction} toggles={toggles} disabled={disabled} hints={hints} />
        )}
      </div>
      <div className="app-titlebar-spacer" />
      <div className="app-titlebar-corner" role="group" aria-label={t('toolbar.appActions')}>
        <div className="toolbar-group" role="group" aria-label={t('toolbar.groupConnect')}>
          <button
            type="button"
            className="titlebar-icon-btn titlebar-tool-btn"
            data-tool="connection"
            title={`${t('toolbar.newConn')} (${keysFor('connection') ?? ''})`}
            aria-label={t('toolbar.newConn')}
            onClick={() => onMenuAction('connection')}
          >
            <span aria-hidden>+</span> <span className="tb-label tb-label-keep">{t('toolbar.newConn')}</span>
          </button>
          {onQuickConnect ? (
            <div className="titlebar-popover-wrap" ref={recentRef}>
              <button
                type="button"
                className="titlebar-icon-btn"
                data-tool="recent"
                title={t('toolbar.recentTitle')}
                aria-label={t('toolbar.recentTitle')}
                aria-expanded={recentOpen}
                onClick={() => setRecentOpen((v) => !v)}
              >
                <Icon name="history" size={20} strokeWidth={1.5} /> <span className="tb-label">{t('toolbar.recent')}</span> <span aria-hidden><Twist open size={12} /></span>
              </button>
              {recentOpen ? (
                <div className="titlebar-popover">
                  <RecentConnections
                    variant="menu"
                    onQuickConnect={(row) => {
                      setRecentOpen(false)
                      onQuickConnect?.(row)
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <span className="toolbar-divider" aria-hidden />
        <div className="toolbar-group" role="group" data-tour="ops" aria-label={t('toolbar.groupOps')}>
          {OPS_BUTTONS.map((b) => {
            const dim = b.needsSession && !hasSession
            const keys = keysFor(b.id)
            const title = dim ? t('pf7.connectFirst') : `${t(b.title)}${keys ? ` (${keys})` : ''}`
            return (
              <button
                key={b.id}
                type="button"
                className={`titlebar-icon-btn titlebar-tool-btn${dim ? ' is-dim' : ''}`}
                data-tool={b.id}
                title={title}
                aria-label={t(b.title)}
                onClick={() => onMenuAction(b.id)}
              >
                <Icon name={b.icon} size={20} strokeWidth={1.5} /> {iconOnlyTools ? null : <span className="tb-label">{t(b.label)}</span>}
              </button>
            )
          })}
        </div>
        <span className="toolbar-divider" aria-hidden />
        <div className="toolbar-group" role="group">
          <button
            type="button"
            className="titlebar-icon-btn titlebar-tool-btn titlebar-search-btn"
            data-tool="commandPalette"
            data-testid="toolbar-palette-field"
            title={t('toolbar.paletteTitle')}
            aria-label={t('toolbar.searchField')}
            onClick={() => onMenuAction('commandPalette')}
          >
            <Icon name="search" size={16} strokeWidth={1.5} />
            <span className="tb-label tb-search-ph">{searchIconOnly ? t('toolbar.searchFieldShort') : t('toolbar.searchField')}</span>
          </button>
          <div className="titlebar-popover-wrap" ref={moreRef}>
            <button
              type="button"
              className="titlebar-icon-btn"
              data-tool="more"
              title={t('toolbar.more')}
              aria-label={t('toolbar.more')}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <span aria-hidden>⋯</span> <span className="tb-label">{t('toolbar.more')}</span> <span aria-hidden><Twist open size={12} /></span>
            </button>
            {moreOpen ? (
              <div className="titlebar-popover titlebar-more-menu" role="menu" data-testid="toolbar-more">
                <button type="button" role="menuitem" onClick={more(() => onMenuAction('backup'))}>
                  {t('menu.backup')}
                </button>
                <button type="button" role="menuitem" onClick={more(() => onMenuAction('checkUpdate'))}>
                  {t('toolbar.checkUpdateEllipsis')}
                </button>
                <button type="button" role="menuitem" onClick={more(() => onMenuAction('whatsNew'))}>
                  {t('menu.whatsNew')}
                </button>
                <button type="button" role="menuitem" onClick={more(() => setLocale(locale === 'en' ? 'zh-CN' : 'en'))}>
                  {t('toolbar.language')}: {locale === 'en' ? '中文' : 'English'}
                </button>
                <button type="button" role="menuitem" onClick={more(onToggleTheme)}>
                  {t('toolbar.theme')}: {lightMode ? t('toolbar.toDark') : t('toolbar.toLight')}
                </button>
                <button type="button" role="menuitem" onClick={more(() => onMenuAction('github'))}>
                  GitHub
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <span className="toolbar-divider" aria-hidden />
        <div className="app-toolbar-layout" role="group" aria-label={t('toolbar.layout')}>
          {onToggleSidebar ? (
            <button
              type="button"
              className={`layout-toggle-btn ${showSidebar ? 'is-on' : ''}`}
              title={showSidebar ? t('toolbar.hideSidebar') : t('toolbar.showSidebar')}
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
              title={showMain ? t('toolbar.hideMain') : t('toolbar.showMain')}
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
              title={showAi ? t('toolbar.hideAi') : t('toolbar.showAi')}
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
