import { useEffect, useState } from 'react'
import {
  applyUiTheme,
  isLightUiTheme,
  loadUiThemeId,
  suggestedTerminalTheme,
  toggleLightDarkTheme,
  UI_THEME_OPTIONS,
  type UiThemeId
} from '../lib/ui-themes'
import { tg } from '../lib/i18n'
import { showToast } from '../lib/toast'

type Props = {
  onClose: () => void
  /** When UI theme changes, also update terminal theme prefs (optional parent sync). */
  onTerminalTheme?: (themeId: import('@shared/ipc').TerminalThemeId) => void
}

async function syncTerminal(uiId: UiThemeId, onTerminalTheme?: Props['onTerminalTheme']) {
  const themeId = suggestedTerminalTheme(uiId)
  try {
    const next = await window.aiss.terminal.setPrefs({ themeId })
    onTerminalTheme?.(next.themeId)
  } catch {
    /* ignore */
  }
}

export default function UiThemeModal({ onClose, onTerminalTheme }: Props) {
  const [selected, setSelected] = useState<UiThemeId>(loadUiThemeId)

  useEffect(() => {
    setSelected(loadUiThemeId())
  }, [])

  const pick = (id: UiThemeId) => {
    setSelected(id)
    applyUiTheme(id)
    void syncTerminal(id, onTerminalTheme)
  }

  const onToggle = () => {
    const next = toggleLightDarkTheme(selected)
    setSelected(next)
    void syncTerminal(next, onTerminalTheme)
    showToast(tg(isLightUiTheme(next) ? 'theme.switchedLight' : 'theme.switchedDark'))
  }

  const light = isLightUiTheme(selected)

  return (
    <div className="workspace-panel workspace-panel--settings" data-testid="ui-theme-modal">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('ui.280')}</h2>
        <div className="workspace-panel-actions">
          <button
            type="button"
            data-testid="ui-theme-toggle-ld"
            title={tg('theme.toggleTip')}
            onClick={onToggle}
          >
            {light ? tg('theme.toDark') : tg('theme.toLight')}
          </button>
          <button type="button" className="primary" onClick={onClose}>
            {tg('ui.281')}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings">
          <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
            {tg('ui.282')}
          </p>
          <p
            className="ui-theme-mode-hint"
            data-testid="ui-theme-mode"
            style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}
          >
            {tg(light ? 'theme.modeLight' : 'theme.modeDark')} · {tg('theme.shortcutHint')} · {tg('theme.pairTerm')}
          </p>
          <div className="ui-theme-grid">
            {UI_THEME_OPTIONS.map((t) => {
              const active = selected === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ui-theme-card${active ? ' is-active' : ''}`}
                  onClick={() => pick(t.id)}
                  aria-pressed={active}
                  data-testid={`ui-theme-${t.id}`}
                >
                  <div
                    className="ui-theme-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${t.swatch.bg} 0 42%, ${t.swatch.panel} 42% 72%, ${t.swatch.accent} 72% 100%)`
                    }}
                  >
                    <span className="ui-theme-swatch-dot" style={{ background: t.swatch.text }} />
                  </div>
                  <div className="ui-theme-card-label">{t.label}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
