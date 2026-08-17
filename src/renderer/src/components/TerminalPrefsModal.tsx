import { useCallback, useEffect, useState } from 'react'
import type { TerminalPrefs, TerminalThemeId } from '@shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '@shared/ipc'
import { TERMINAL_THEME_OPTIONS } from '../lib/terminal-themes'

type Props = {
  onClose: () => void
  onSaved?: (prefs: TerminalPrefs) => void
}

export default function TerminalPrefsModal({ onClose, onSaved }: Props) {
  const [themeId, setThemeId] = useState<TerminalThemeId>(TERMINAL_PREFS_DEFAULTS.themeId)
  const [fontFamily, setFontFamily] = useState(TERMINAL_PREFS_DEFAULTS.fontFamily)
  const [fontSize, setFontSize] = useState(TERMINAL_PREFS_DEFAULTS.fontSize)
  const [scrollback, setScrollback] = useState(TERMINAL_PREFS_DEFAULTS.scrollback)
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setHint(null)
    void window.aiss.terminal.getPrefs().then((p) => {
      setThemeId(p.themeId)
      setFontFamily(p.fontFamily)
      setFontSize(p.fontSize)
      setScrollback(p.scrollback)
    })
  }, [])

  const save = useCallback(async () => {
    setBusy(true)
    try {
      const next = await window.aiss.terminal.setPrefs({
        themeId,
        fontFamily: fontFamily.trim() || TERMINAL_PREFS_DEFAULTS.fontFamily,
        fontSize: Math.min(48, Math.max(8, Math.round(fontSize) || 14)),
        scrollback: Math.min(100000, Math.max(100, Math.round(scrollback) || 4000))
      })
      onSaved?.(next)
      setHint('已保存')
    } finally {
      setBusy(false)
    }
  }, [fontFamily, fontSize, onSaved, scrollback, themeId])

  return (
    <div className="workspace-panel workspace-panel--settings">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">终端外观</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            关闭
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings">
          <div className="field">
            <label>主题</label>
            <select
              value={themeId}
              onChange={(e) => setThemeId(e.target.value as TerminalThemeId)}
              style={{ width: '100%' }}
            >
              {TERMINAL_THEME_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>字体</label>
            <input
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder={TERMINAL_PREFS_DEFAULTS.fontFamily}
            />
          </div>
          <div className="field">
            <label>字号（px）</label>
            <input
              type="number"
              min={8}
              max={48}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10) || 14)}
            />
          </div>
          <div className="field">
            <label>回滚行数（scrollback）</label>
            <input
              type="number"
              min={100}
              max={100000}
              step={100}
              value={scrollback}
              onChange={(e) => setScrollback(parseInt(e.target.value, 10) || 4000)}
            />
          </div>
          {hint ? <p style={{ margin: 0, fontSize: 12, color: 'var(--accent)' }}>{hint}</p> : null}
        </div>
      </div>
    </div>
  )
}
