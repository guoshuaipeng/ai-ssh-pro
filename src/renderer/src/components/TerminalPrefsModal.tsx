import { useCallback, useEffect, useState } from 'react'
import type { TerminalPrefs, TerminalThemeId } from '@shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '@shared/ipc'
import { TERMINAL_THEME_OPTIONS } from '../lib/terminal-themes'
import { tg } from '../lib/i18n'
import { loadSmartHistory, loadSmartPrefs, saveSmartPrefs } from '../lib/smart-history'
import type { SmartPrefs } from '@shared/smart-complete'

type Props = {
  onClose: () => void
  onSaved?: (prefs: TerminalPrefs) => void
  /** UX-13: inside the settings tab, changes save themselves. */
  embedded?: boolean
}

export default function TerminalPrefsModal({ onClose, onSaved, embedded = false }: Props) {
  const [themeId, setThemeId] = useState<TerminalThemeId>(TERMINAL_PREFS_DEFAULTS.themeId)
  const [fontFamily, setFontFamily] = useState(TERMINAL_PREFS_DEFAULTS.fontFamily)
  const [fontSize, setFontSize] = useState(TERMINAL_PREFS_DEFAULTS.fontSize)
  const [scrollback, setScrollback] = useState(TERMINAL_PREFS_DEFAULTS.scrollback)
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [smart, setSmart] = useState<SmartPrefs>(() => loadSmartPrefs())
  const [loaded, setLoaded] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)

  useEffect(() => {
    setHint(null)
    void window.aiss.terminal.getPrefs().then((p) => {
      setThemeId(p.themeId)
      setFontFamily(p.fontFamily)
      setFontSize(p.fontSize)
      setScrollback(p.scrollback)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!embedded || !loaded) return
    if (fontSize < 8 || fontSize > 48 || scrollback < 100 || scrollback > 100000) {
      setRangeError(tg('settings.number', { min: fontSize < 8 || fontSize > 48 ? 8 : 100, max: fontSize < 8 || fontSize > 48 ? 48 : 100000 }))
      return
    }
    setRangeError(null)
    const timer = window.setTimeout(() => void save(), 400)
    return () => window.clearTimeout(timer)
    // save identity changes every render; the fields are the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, loaded, themeId, fontFamily, fontSize, scrollback])

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
      setHint(tg('ui.4'))
    } finally {
      setBusy(false)
    }
  }, [fontFamily, fontSize, onSaved, scrollback, themeId])

  return (
    <div className={embedded ? 'settings-embed' : 'workspace-panel workspace-panel--settings'} data-testid="terminal-prefs">
      {embedded ? null : (
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{tg('ui.275')}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            {tg('ui.27')}
          </button>
          <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
            {busy ? tg('ui.185') : tg('ui.25')}
          </button>
        </div>
      </div>
      )}
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings">
          <div className="field">
            <label>{tg('ui.276')}</label>
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
            <label>{tg('ui.277')}</label>
            <input
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              placeholder={TERMINAL_PREFS_DEFAULTS.fontFamily}
            />
          </div>
          <div className="field">
            <label>{tg('ui.278')}</label>
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
            <label>{tg('ui.279')}</label>
            <input
              type="number"
              min={100}
              max={100000}
              step={100}
              value={scrollback}
              onChange={(e) => setScrollback(parseInt(e.target.value, 10) || 4000)}
            />
          </div>
          <fieldset className="smart-prefs" data-testid="smart-prefs">
            <legend>{tg('x1.title')}</legend>
            <label>
              <input type="checkbox" checked={smart.enabled} onChange={(e) => setSmart(saveSmartPrefs({ ...smart, enabled: e.target.checked }))} />
              {tg('x1.enabled')}
            </label>
            <label>
              <input type="checkbox" checked={smart.ghost} onChange={(e) => setSmart(saveSmartPrefs({ ...smart, ghost: e.target.checked }))} />
              {tg('x1.ghost')}
            </label>
            <div className="smart-sources">
              {tg('x1.sources')}
              <label>
                <input type="checkbox" checked={smart.sourceHost} onChange={(e) => setSmart(saveSmartPrefs({ ...smart, sourceHost: e.target.checked }))} />
                {tg('x1.host')}
              </label>
              <label>
                <input type="checkbox" checked={smart.sourceCommon} onChange={(e) => setSmart(saveSmartPrefs({ ...smart, sourceCommon: e.target.checked }))} />
                {tg('x1.common')}
              </label>
              <label>
                <input type="checkbox" checked={smart.sourceSnippets} onChange={(e) => setSmart(saveSmartPrefs({ ...smart, sourceSnippets: e.target.checked }))} />
                {tg('x1.snippet')}
              </label>
            </div>
            <p className="smart-count">{tg('x1.recorded', { n: loadSmartHistory().length })}</p>
          </fieldset>
          {rangeError ? <p className="jump-issue">{rangeError}</p> : null}
          {hint ? <p style={{ margin: 0, fontSize: 12, color: 'var(--accent)' }}>{hint}</p> : null}
        </div>
      </div>
    </div>
  )
}
