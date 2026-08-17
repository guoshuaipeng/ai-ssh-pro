import { useEffect, useState } from 'react'
import {
  applyUiTheme,
  loadUiThemeId,
  UI_THEME_OPTIONS,
  type UiThemeId
} from '../lib/ui-themes'

type Props = {
  onClose: () => void
}

export default function UiThemeModal({ onClose }: Props) {
  const [selected, setSelected] = useState<UiThemeId>(loadUiThemeId)

  useEffect(() => {
    setSelected(loadUiThemeId())
  }, [])

  const pick = (id: UiThemeId) => {
    setSelected(id)
    applyUiTheme(id)
  }

  return (
    <div className="workspace-panel workspace-panel--settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">界面主题</h2>
        <div className="workspace-panel-actions">
          <button type="button" className="primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings">
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
            选择应用界面配色（立即生效，并记住本机偏好）。终端配色请在「终端外观」中单独设置。
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
