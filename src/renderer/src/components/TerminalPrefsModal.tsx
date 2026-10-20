import { useCallback, useEffect, useState } from 'react'
import type { TerminalPrefs, TerminalThemeId } from '@shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '@shared/ipc'
import { TERMINAL_THEME_OPTIONS } from '../lib/terminal-themes'
import { tg } from '../lib/i18n'
import { loadSmartHistory, loadSmartPrefs, saveSmartPrefs } from '../lib/smart-history'
import type { SmartPrefs } from '@shared/smart-complete'
import { listPasteSkipHosts, setPasteSkipHost } from '../lib/paste-pref'
import PanelHeader from './ui/PanelHeader'
import Button from './ui/Button'

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
  const [osc52Clipboard, setOsc52Clipboard] = useState(TERMINAL_PREFS_DEFAULTS.osc52Clipboard)
  const [muteBell, setMuteBell] = useState(TERMINAL_PREFS_DEFAULTS.muteBell)
  const [copyOnSelect, setCopyOnSelect] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [smart, setSmart] = useState<SmartPrefs>(() => loadSmartPrefs())
  // D7c: manage hosts that no longer preview multi-line paste
  const [skipHosts, setSkipHosts] = useState<string[]>(() => listPasteSkipHosts())
  const askAgain = (keys: string[]) => {
    for (const k of keys) setPasteSkipHost(k, false)
    setSkipHosts(listPasteSkipHosts())
  }
  const [loaded, setLoaded] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)

  useEffect(() => {
    setHint(null)
    void window.aiss.terminal.getPrefs().then((p) => {
      setThemeId(p.themeId)
      setFontFamily(p.fontFamily)
      setFontSize(p.fontSize)
      setScrollback(p.scrollback)
      setOsc52Clipboard(p.osc52Clipboard !== false)
      setMuteBell(p.muteBell === true)
      setCopyOnSelect(p.copyOnSelect === true)
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
  }, [embedded, loaded, themeId, fontFamily, fontSize, scrollback, osc52Clipboard, muteBell, copyOnSelect])

  const save = useCallback(async () => {
    setBusy(true)
    try {
      const next = await window.aiss.terminal.setPrefs({
        themeId,
        fontFamily: fontFamily.trim() || TERMINAL_PREFS_DEFAULTS.fontFamily,
        fontSize: Math.min(48, Math.max(8, Math.round(fontSize) || 14)),
        scrollback: Math.min(100000, Math.max(100, Math.round(scrollback) || 4000)),
        osc52Clipboard,
        muteBell,
        copyOnSelect
      })
      onSaved?.(next)
      setHint(tg('ui.4'))
    } finally {
      setBusy(false)
    }
  }, [copyOnSelect, fontFamily, fontSize, muteBell, onSaved, osc52Clipboard, scrollback, themeId])

  return (
    <div className={embedded ? 'settings-embed' : 'workspace-panel workspace-panel--settings'} data-testid="terminal-prefs">
      {embedded ? null : (
      <PanelHeader
        title={tg('ui.275')}
        actions={
          <>
            <button type="button" onClick={onClose} disabled={busy}>
              {tg('ui.27')}
            </button>
            <Button variant="primary" onClick={() => void save()} disabled={busy}>
              {busy ? tg('ui.185') : tg('ui.25')}
            </Button>
          </>
        }
      />
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

          <label className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="osc52-clipboard"
              checked={osc52Clipboard}
              onChange={(e) => setOsc52Clipboard(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong style={{ display: 'block', fontSize: 13 }}>{tg('term.osc52')}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{tg('term.osc52Hint')}</span>
            </span>
          </label>

          <label className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="copy-on-select"
              checked={copyOnSelect}
              onChange={(e) => setCopyOnSelect(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong style={{ display: 'block', fontSize: 13 }}>{tg('d92.title')}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{tg('d92.hint')}</span>
            </span>
          </label>

          <label className="field" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              data-testid="mute-bell"
              checked={muteBell}
              onChange={(e) => setMuteBell(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong style={{ display: 'block', fontSize: 13 }}>{tg('term.muteBell')}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{tg('term.muteBellHint')}</span>
            </span>
          </label>
          <fieldset className="paste-skip-prefs" data-testid="paste-skip-prefs">
            <legend>{tg('d7c.title')}</legend>
            {skipHosts.length === 0 ? (
              <p className="paste-skip-empty">{tg('d7c.empty')}</p>
            ) : (
              <>
                <ul className="paste-skip-list">
                  {skipHosts.map((h) => (
                    <li key={h}>
                      <code>{h}</code>
                      <button type="button" data-testid="paste-skip-ask" onClick={() => askAgain([h])}>
                        {tg('d7c.askAgain')}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" data-testid="paste-skip-ask-all" onClick={() => askAgain(skipHosts)}>
                  {tg('d7c.askAll', { n: skipHosts.length })}
                </button>
              </>
            )}
            <p className="paste-skip-empty">{tg('d7c.note')}</p>
          </fieldset>
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
