import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_ALERT_NOTIFY,
  DEFAULT_ALERT_RULES,
  type AlertNotifyPrefs,
  type AlertRule,
  type AlertRulesState,
  type FiredAlert
} from '@shared/alert-rules'
import { isHigherChromeOpen } from '@shared/overlay-stack'
import { captureEditorFocus, restoreEditorFocus, type EditorFocusTicket } from '../lib/focus-restore'
import { isDialogOpen } from '../lib/dialogs'
import { useI18n } from '../lib/i18n'
import EmptyState from './EmptyState'
import Button from './ui/Button'

type Props = {
  open: boolean
  initial: AlertRulesState
  history: FiredAlert[]
  onClose: () => void
  onSave: (next: AlertRulesState) => void
  onClearHistory: () => void
  onMute1h: () => void
  focusHostKey?: string | null
  initialTab?: 'rules' | 'history'
  onLocate?: (alert: FiredAlert) => void
  onInterpret?: (alert: FiredAlert) => void
  onIgnore?: (alert: FiredAlert) => void
}

const METRIC_KEYS: Record<string, 'o2.metricCpu' | 'o2.metricMem' | 'o2.metricDisk' | 'o2.metricOffline'> = {
  cpu: 'o2.metricCpu',
  mem: 'o2.metricMem',
  disk: 'o2.metricDisk',
  offline: 'o2.metricOffline'
}

/**
 * IX-7: alert-rule editing is an in-tab panel (`kind=alert-rules`), not a
 * full-screen `.modal`. The workbench list stays mounted beside it.
 * Esc / close restores the surface that was active before the panel opened.
 */
export default function AlertRulesModal({
  open,
  initial,
  history,
  onClose,
  onSave,
  onClearHistory,
  onMute1h,
  focusHostKey,
  initialTab = 'rules',
  onLocate,
  onInterpret,
  onIgnore
}: Props) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLDivElement>(null)
  const ticketRef = useRef<EditorFocusTicket | null>(null)
  const initialRef = useRef(initial)
  initialRef.current = initial
  const [tab, setTab] = useState<'rules' | 'history'>(initialTab)
  const [rules, setRules] = useState<AlertRule[]>(() => initial.rules.map((r) => ({ ...r })))
  const [notify, setNotify] = useState<AlertNotifyPrefs>(() => ({ ...initial.notify }))

  useEffect(() => {
    if (!open) return
    const snap = initialRef.current
    setTab(initialTab)
    setRules(snap.rules.map((r) => ({ ...r })))
    setNotify({ ...snap.notify })
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      ticketRef.current = captureEditorFocus()
      panelRef.current?.focus()
    })
    return () => {
      alive = false
      const ticket = ticketRef.current
      ticketRef.current = null
      restoreEditorFocus(ticket)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const panel = panelRef.current
      if (!panel) return
      const layer = panel.closest('.terminal-layer')
      if (layer && !layer.classList.contains('active')) return
      if (isHigherChromeOpen(document)) return
      if (isDialogOpen()) return
      if (document.querySelector('.modal')) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const title = tab === 'rules' ? t('o2.rulesTitle') : t('o2.historyTitle')
  const kind = tab === 'history' ? 'alert-workbench' : 'alert-rules'

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.at - a.at),
    [history]
  )

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="alert-rules-panel"
      data-testid="alert-rules-panel"
      data-kind={kind}
      role="region"
      aria-label={title}
      tabIndex={-1}
    >
      <div className="alert-rules-panel-head">
        <h2>{title}</h2>
        <Button variant="icon" icon="x" className="modal-close" data-testid="alert-rules-close" aria-label={t('common.close')} onClick={onClose} />
      </div>
      <div className="o2-tabs" role="tablist">
        <button type="button" className={tab === 'rules' ? 'is-on' : ''} onClick={() => setTab('rules')}>
          {t('o2.rulesTitle')}
        </button>
        <button type="button" className={tab === 'history' ? 'is-on' : ''} onClick={() => setTab('history')}>
          {t('o2.historyTitle')}
        </button>
      </div>
      {tab === 'rules' ? (
        <div className="o2-body">
          <p className="o2-hint">{t('o2.scopeHint')}</p>
          {focusHostKey ? <p className="o2-hint">{t('o2.hostOverrideHint', { host: focusHostKey })}</p> : null}
          <table className="o2-table">
            <thead>
              <tr>
                <th>{t('o2.colOn')}</th>
                <th>{t('o2.colRule')}</th>
                <th>{t('o2.colThreshold')}</th>
                <th>{t('o2.colSustain')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, idx) => {
                const labelKey = METRIC_KEYS[r.id]
                const label = labelKey ? t(labelKey) : r.id
                return (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        onChange={(e) => {
                          const enabled = e.target.checked
                          setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled } : x)))
                        }}
                      />
                    </td>
                    <td>{label}</td>
                    <td>
                      {r.id === 'offline' ? (
                        <span>—</span>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={r.threshold}
                          onChange={(e) => {
                            const threshold = Number(e.target.value) || r.threshold
                            setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, threshold } : x)))
                          }}
                          style={{ width: 64 }}
                        />
                      )}
                      {r.id === 'offline' ? '' : '%'}
                    </td>
                    <td>
                      <select
                        value={r.sustainMin}
                        onChange={(e) => {
                          const sustainMin = Number(e.target.value)
                          setRules((prev) => prev.map((x, i) => (i === idx ? { ...x, sustainMin } : x)))
                        }}
                      >
                        {[0, 1, 2, 5, 10, 15].map((n) => (
                          <option key={n} value={n}>
                            {t('o2.sustain', { n })}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <fieldset className="o2-notify">
            <legend>{t('o2.notify')}</legend>
            {(
              [
                ['systemNotify', 'o2.notifySystem'],
                ['markRed', 'o2.notifyMark'],
                ['sound', 'o2.notifySound'],
                ['notifyOnRecover', 'o2.notifyRecover']
              ] as const
            ).map(([key, labelKey]) => (
              <label key={key} className="o2-check">
                <input
                  type="checkbox"
                  checked={notify[key]}
                  onChange={(e) => setNotify((n) => ({ ...n, [key]: e.target.checked }))}
                />
                {t(labelKey)}
              </label>
            ))}
          </fieldset>
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => {
                setRules(DEFAULT_ALERT_RULES.map((r) => ({ ...r })))
                setNotify({ ...DEFAULT_ALERT_NOTIFY })
              }}
            >
              {t('o2.reset')}
            </button>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onMute1h}>
              {t('o2.mute1h')}
            </button>
            <button type="button" data-testid="alert-rules-cancel" onClick={onClose}>
              {t('dlg.cancel')}
            </button>
            <Button variant="primary"
              onClick={() => {
                onSave({ rules, notify, mutedUntil: initial.mutedUntil, packRules: initial.packRules ?? [] })
                onClose()
              }}
            >
              {t('ui.25')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="o2-body">
          {sortedHistory.length === 0 ? (
            <EmptyState compact testId="o2-history-empty" icon="alert" title={t('o2.emptyHistory')} />
          ) : (
            <>
            {onInterpret && sortedHistory.some((h) => h.status === 'active') ? (
              <p className="a4-privacy" data-testid="a4-privacy-history">
                {t('a4.privacy')}
              </p>
            ) : null}
            <ul className="o2-history">
              {sortedHistory.map((h) => (
                <li key={h.id}>
                  <time>{new Date(h.at).toLocaleString()}</time>
                  <strong>{h.hostTitle}</strong>
                  <span>
                    {h.ruleId} {Math.round(h.value)}
                    {h.ruleId === 'offline' ? '' : `% > ${h.threshold}%`}
                  </span>
                  <em>{h.status === 'active' ? t('o2.active') : h.status === 'ignored' ? t('o4.ignore') : t('o2.recovered')}</em>
                  {h.status === 'active' ? (
                    <span className="o2-row-actions">
                      {onLocate ? (
                        <button type="button" data-testid="o4-locate-row" onClick={() => onLocate(h)}>
                          {t('o4.locate')}
                        </button>
                      ) : null}
                      {onInterpret ? (
                        <button type="button" data-testid="a4-interpret-row" onClick={() => onInterpret(h)}>
                          {t('a4.interpret')}
                        </button>
                      ) : null}
                      {onIgnore ? (
                        <button type="button" onClick={() => onIgnore(h)}>
                          {t('o4.ignore')}
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            </>
          )}
          <div className="modal-actions">
            <button type="button" onClick={onClearHistory} disabled={!sortedHistory.length}>
              {t('o2.clearHistory')}
            </button>
            <span style={{ flex: 1 }} />
            <Button variant="primary" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
