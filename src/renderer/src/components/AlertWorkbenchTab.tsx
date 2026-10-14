import { useEffect, useMemo, useState } from 'react'
import type { FiredAlert } from '@shared/alert-rules'
import { filterAlerts, type AlertFilter, type BellPrefs } from '@shared/alert-workbench'
import { locateTargetFor } from '@shared/alert-locate'
import { useI18n } from '../lib/i18n'
import AiAssistCard, { type AiExplainRequest } from './AiAssistCard'
import AiConfigCard from './AiConfigCard'
import { AlertLine } from './AlertLine'
import EmptyState from './EmptyState'

const TARGET_KEY = {
  df: 'st.tab.df',
  processes: 'st.tab.processes',
  services: 'st.tab.services',
  terminal: 'l2.openTerminal'
} as const

export default function AlertWorkbenchTab({
  alerts,
  focusId,
  focusNonce,
  initialFilter,
  mutedUntil,
  onlineIds,
  aiConfigured,
  prefs,
  onPrefs,
  onRules,
  onMute,
  onUnmute,
  onDismiss,
  onHandled,
  onLocate,
  onOpenTerminal,
  onOpenMonitor,
  onOpenToolbox,
  onOpenDashboard,
  onInsert,
  onRun,
  buildContext,
  onOpenSettings,
  autoExplain
}: {
  alerts: FiredAlert[]
  focusId?: string
  focusNonce?: number
  initialFilter?: AlertFilter
  mutedUntil: number | null
  onlineIds: Set<string>
  aiConfigured: boolean
  prefs: BellPrefs
  onPrefs: (p: BellPrefs) => void
  onRules: () => void
  onMute: () => void
  onUnmute: () => void
  onDismiss: (a: FiredAlert) => void
  onHandled: (a: FiredAlert) => void
  onLocate: (a: FiredAlert) => void
  onOpenTerminal: (a: FiredAlert) => void
  onOpenMonitor: (a: FiredAlert) => void
  onOpenToolbox: (a: FiredAlert) => void
  onOpenDashboard: () => void
  onInsert: (sessionId: string, command: string) => void
  onRun: (alert: FiredAlert, command: string) => void
  buildContext: (alert: FiredAlert, includeLogs: boolean) => Promise<string>
  onOpenSettings: () => void
  autoExplain?: boolean
}) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<AlertFilter>(initialFilter ?? 'active')
  const [host, setHost] = useState('')
  const [rule, setRule] = useState('')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? null)
  const [now, setNow] = useState(() => Date.now())
  const [more, setMore] = useState(false)
  const [narrowDetail, setNarrowDetail] = useState(false)
  const [located, setLocated] = useState<Record<string, string>>({})
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [includeLogs, setIncludeLogs] = useState(true)
  const [explain, setExplain] = useState<AiExplainRequest | null>(null)
  const [explainAlertId, setExplainAlertId] = useState<string | null>(null)

  useEffect(() => {
    if (initialFilter) setFilter(initialFilter)
  }, [initialFilter, focusNonce])

  useEffect(() => {
    if (focusId) {
      setSelectedId(focusId)
      setNarrowDetail(true)
    }
  }, [focusId, focusNonce])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const rows = useMemo(() => filterAlerts(alerts, { status: filter, host: host || undefined, rule: rule || undefined, q }), [alerts, filter, host, rule, q])
  const hosts = useMemo(() => [...new Set(alerts.map((a) => a.hostTitle))], [alerts])
  const rules = useMemo(() => [...new Set(alerts.map((a) => a.ruleId))], [alerts])
  const selected = rows.find((a) => a.id === selectedId) ?? rows[0] ?? null
  const activeN = alerts.filter((a) => a.status === 'active').length
  const muted = mutedUntil != null && mutedUntil > now
  const online = selected ? onlineIds.has(selected.hostKey) : false

  const explainThis = async (alert: FiredAlert) => {
    setSelectedId(alert.id)
    setNarrowDetail(true)
    if (!aiConfigured) {
      setExplain(null)
      setExplainAlertId(alert.id)
      return
    }
    const text = await buildContext(alert, includeLogs && online)
    setExplainAlertId(alert.id)
    setExplain({ id: Date.now(), sessionId: alert.hostKey, text, host: alert.hostTitle, kind: 'explainAlert' })
  }

  useEffect(() => {
    if (!autoExplain || !focusId) return
    const alert = alerts.find((a) => a.id === focusId)
    if (alert) void explainThis(alert)
    // Re-run when the tab asks again (nonce), not on every alerts tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExplain, focusNonce])

  const doLocate = (alert: FiredAlert) => {
    setLocating(true)
    setLocateError(null)
    const target = locateTargetFor(alert.ruleId)
    const label = target.kind === 'toolbox' ? t(TARGET_KEY[target.tab]) : t('l2.openTerminal')
    try {
      if (!onlineIds.has(alert.hostKey) && target.kind !== 'terminal') {
        setLocateError(t('l2.offlineHost'))
      }
      onLocate(alert)
      setLocated((prev) => ({ ...prev, [alert.id]: label }))
    } catch (e) {
      setLocateError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="workspace-panel l2-root" data-testid="alert-workbench">
      <div className="workspace-panel-toolbar l2-head">
        <h2 className="workspace-panel-title">
          {t('l2.title')}
          <span className="l7-meta">{t('l2.activeN', { n: activeN })}</span>
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onRules}>
            {t('menu.alertRules')}
          </button>
          <button type="button" onClick={muted ? onUnmute : onMute}>
            {muted ? t('l7.unmute') : t('l2.mute1h')}
          </button>
          <button
            type="button"
            aria-label={t('l7.more')}
            onClick={() => setMore((v) => !v)}
          >
            ⋯
          </button>
        </div>
      </div>
      {muted ? (
        <div className="l7-mute">
          {t('l7.mutedUntil', { time: new Date(mutedUntil!).toLocaleTimeString() })}
        </div>
      ) : null}
      {more ? (
        <div className="l2-prefs" data-testid="l2-prefs">
          <label>
            <input
              type="checkbox"
              checked={prefs.autoLocate}
              onChange={(e) => onPrefs({ ...prefs, autoLocate: e.target.checked })}
            />
            {t('l2.autoLocate')}
          </label>
          <label>
            {t('l2.bellOpens')}
            <select
              value={prefs.mode}
              onChange={(e) => onPrefs({ ...prefs, mode: e.target.value as BellPrefs['mode'] })}
            >
              <option value="workbench">{t('l2.title')}</option>
              <option value="drawer">{t('l2.historyDrawer')}</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.mirrorAi}
              onChange={(e) => onPrefs({ ...prefs, mirrorAi: e.target.checked })}
            />
            {t('l2.mirrorAi')}
          </label>
        </div>
      ) : null}
      <div className="l2-filters">
        {(['active', 'all', 'ignored', 'recovered'] as const).map((key) => (
          <button key={key} type="button" className={filter === key ? 'is-on' : ''} onClick={() => setFilter(key)}>
            {t(key === 'active' ? 'l2.active' : key === 'ignored' ? 'l2.dismissed' : key === 'recovered' ? 'l2.recovered' : 'l2.all')}
          </button>
        ))}
        <select aria-label={t('l2.host')} value={host} onChange={(e) => setHost(e.target.value)}>
          <option value="">{t('l2.anyHost')}</option>
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select aria-label={t('l2.rule')} value={rule} onChange={(e) => setRule(e.target.value)}>
          <option value="">{t('l2.anyRule')}</option>
          {rules.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('l2.search')} aria-label={t('l2.search')} />
      </div>
      <div className={`l2-body${narrowDetail ? ' is-detail' : ''}`}>
        <div className="l2-list" role="listbox" aria-label={t('l2.title')} tabIndex={0}
          onKeyDown={(e) => {
            if (!rows.length) return
            const idx = Math.max(0, rows.findIndex((r) => r.id === (selected?.id ?? '')))
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelectedId(rows[Math.min(rows.length - 1, idx + 1)]!.id)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelectedId(rows[Math.max(0, idx - 1)]!.id)
            } else if (e.key === 'Enter' && selected) {
              e.preventDefault()
              if (e.shiftKey) void explainThis(selected)
              else doLocate(selected)
            } else if (e.key === 'Delete' && selected && selected.status === 'active') {
              onDismiss(selected)
            }
          }}
        >
          {rows.length === 0 ? (
            <EmptyState
              compact
              testId="l2-empty"
              icon="🔔"
              title={t('l2.empty')}
              primary={{ label: t('l2.viewHistory'), onClick: () => setFilter('all') }}
              secondary={[
                { label: t('l7.openDashboard'), onClick: onOpenDashboard },
                { label: t('menu.alertRules'), onClick: onRules }
              ]}
            />
          ) : (
            rows.map((a) => (
              <AlertLine
                key={a.id}
                alert={a}
                now={now}
                selected={selected?.id === a.id}
                onSelect={() => {
                  setSelectedId(a.id)
                  setNarrowDetail(true)
                  setLocateError(null)
                }}
                onOpen={() => doLocate(a)}
              />
            ))
          )}
        </div>
        <div className="l2-detail">
          <button type="button" className="l2-back" onClick={() => setNarrowDetail(false)}>
            {t('l2.backToList')}
          </button>
          {!selected ? (
            <p className="l7-muted">{t('l2.pick')}</p>
          ) : (
            <>
              <h3 className="l2-detail-title" title={selected.hostTitle}>
                {selected.hostTitle}
                <span>
                  {selected.ruleId} · {selected.ruleId === 'offline' ? t('l2.offline') : `${Math.round(selected.value)}%`}
                </span>
              </h3>
              <p className="l7-muted">
                {t('l2.threshold', { n: selected.threshold })}
                {selected.handledManually ? ` · ${t('l2.handledManually')}` : ''}
              </p>
              {!online ? <div className="l2-warn">{t('l2.offlineHost')}</div> : null}
              {locateError ? (
                <div className="l2-error" data-testid="l2-locate-error">
                  {t('l2.cantLocate', { reason: locateError })}
                  <button type="button" onClick={() => doLocate(selected)}>
                    {t('upd.retry')}
                  </button>
                  <button type="button" onClick={() => onOpenTerminal(selected)}>
                    {t('l2.openTerminal')}
                  </button>
                </div>
              ) : null}
              <div className="l2-status-row">
                <span>
                  {t('l2.status')}: {t(selected.status === 'active' ? 'l2.active' : selected.status === 'ignored' ? 'l2.dismissed' : 'l2.recovered')}
                </span>
                {selected.status === 'active' ? (
                  <>
                    <button type="button" onClick={() => onDismiss(selected)}>
                      {t('l2.dismiss')}
                    </button>
                    <button type="button" onClick={() => onHandled(selected)}>
                      {t('l2.markHandled')}
                    </button>
                  </>
                ) : null}
              </div>
              <div className="l2-actions">
                <button
                  type="button"
                  className="primary"
                  data-testid="l2-locate"
                  disabled={locating}
                  onClick={() => doLocate(selected)}
                >
                  {locating ? t('l2.connecting', { host: selected.hostTitle }) : t('l2.locate')}
                </button>
                <button type="button" title={t('l2.openTerminal')} onClick={() => onOpenTerminal(selected)}>
                  <span className="l2-lbl">{t('l2.openTerminal')}</span>
                </button>
                <button type="button" title={t('menu.resourceMonitor')} onClick={() => onOpenMonitor(selected)}>
                  <span className="l2-lbl">{t('menu.resourceMonitor')}</span>
                </button>
                <button type="button" title={t('tab.toolbox')} onClick={() => onOpenToolbox(selected)}>
                  <span className="l2-lbl">{t('tab.toolbox')}</span>
                </button>
                <button type="button" data-testid="l2-explain" onClick={() => void explainThis(selected)}>
                  ✨ {t('a4.interpret')}
                </button>
              </div>
              {located[selected.id] ? (
                <button type="button" className="l2-located" onClick={() => doLocate(selected)}>
                  {t('l2.navigated', { target: located[selected.id]! })}
                </button>
              ) : null}
              <div className="l2-ai">
                <label className="l4-check">
                  <input type="checkbox" checked={includeLogs} onChange={(e) => setIncludeLogs(e.target.checked)} />
                  {t('l2.includeLogs')}
                </label>
                <p className="a4-privacy" data-testid="l2-privacy">
                  {t('a4.privacy')}
                </p>
                {explainAlertId === selected.id && !aiConfigured ? (
                  <AiConfigCard context={t('ux37.needAlert')} onConfigure={onOpenSettings} />
                ) : null}
                {explain && explainAlertId === selected.id && aiConfigured ? (
                  <AiAssistCard
                    key={explain.id}
                    embed
                    request={explain}
                    onClose={() => setExplain(null)}
                    onOpenSettings={onOpenSettings}
                    onInsert={onInsert}
                    onRun={(_sid, command) => onRun(selected, command)}
                  />
                ) : null}
                {explainAlertId === selected.id && aiConfigured ? (
                  <button type="button" onClick={() => void explainThis(selected)}>
                    {t('l2.reanalyze')}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
