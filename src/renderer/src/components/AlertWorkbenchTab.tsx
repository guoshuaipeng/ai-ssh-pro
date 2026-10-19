import { useEffect, useMemo, useState } from 'react'
import type { AlertRulesState, FiredAlert } from '@shared/alert-rules'
import { filterAlerts, type AlertFilter, type BellPrefs } from '@shared/alert-workbench'
import { locateTargetFor } from '@shared/alert-locate'
import { appendTimeline, ensureFired, eventsFor, viewTimeline } from '@shared/timeline'
import { loadAudit } from '@shared/audit-log'
import { activeWindows, loadMaintenance, silenceUntil, type MaintSubject } from '@shared/maintenance'
import { isEmptyTimeline } from '@shared/postmortem-ai'
import { markLoop } from '@shared/alert-loop'
import LoopNav from './LoopNav'
import { useI18n } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { fixesFor } from '../lib/ai-fix-memory'
import AiAssistCard, { type AiExplainRequest } from './AiAssistCard'
import AiConfigCard from './AiConfigCard'
import { AlertLine } from './AlertLine'
import AlertRulesModal from './AlertRulesModal'
import EmptyState from './EmptyState'
import Icon from './Icon'
import Button from './ui/Button'
import PanelHeader from './ui/PanelHeader'

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
  onTemplates,
  onMute,
  onUnmute,
  onDismiss,
  onHandled,
  onLocate,
  onOpenTerminal,
  onOpenMonitor,
  onOpenToolbox,
  onOpenDashboard,
  onOpenHome,
  onInsert,
  onRun,
  buildContext,
  onOpenSettings,
  autoExplain,
  onCreatePlaybook,
  onExportPostmortem,
  onNeedAi,
  onOpenMaintenance,
  onAiPostmortem,
  onOpenSftp,
  catalog = [],
  rulesDock = null,
  ruleState,
  onSaveRules,
  onClearHistory
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
  onTemplates?: () => void
  onMute: () => void
  onUnmute: () => void
  onDismiss: (a: FiredAlert) => void
  onHandled: (a: FiredAlert) => void
  onLocate: (a: FiredAlert) => void
  onOpenTerminal: (a: FiredAlert) => void
  onOpenMonitor: (a: FiredAlert) => void
  onOpenToolbox: (a: FiredAlert) => void
  onOpenDashboard: () => void
  onOpenHome?: () => void
  onInsert: (sessionId: string, command: string) => void
  onRun: (alert: FiredAlert, command: string) => void
  buildContext: (alert: FiredAlert, includeLogs: boolean) => Promise<string>
  onOpenSettings: () => void
  autoExplain?: boolean
  onCreatePlaybook?: (alert: FiredAlert, fixes: Array<{ command: string; note?: string }>) => void
  onExportPostmortem?: (alert: FiredAlert) => void
  /** W1b: AI is not configured. Toast only — do not start an interpret. */
  onNeedAi?: () => void
  onOpenMaintenance?: (hostKeys?: string[]) => void
  onAiPostmortem?: (alert: FiredAlert) => void
  onOpenSftp?: (alert: FiredAlert) => void
  catalog?: Array<{ id: string; title: string; tags?: string[]; sessionId?: string }>
  /** IX-7: bump nonce to dock the rules editor beside the list. */
  rulesDock?: { nonce: number; tab: 'rules' | 'history' } | null
  ruleState: AlertRulesState
  onSaveRules: (next: AlertRulesState) => void
  onClearHistory: () => void
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
  const [pane, setPane] = useState<'detail' | 'timeline'>('detail')
  const [showGates, setShowGates] = useState(true)
  const [showConcurrent, setShowConcurrent] = useState(true)
  const [note, setNote] = useState('')
  const [maintOnly, setMaintOnly] = useState(false)
  const [maintTick, setMaintTick] = useState(0)
  useEffect(() => {
    const sync = () => setMaintTick((n) => n + 1)
    window.addEventListener('aiss-maintenance-change', sync)
    const id = window.setInterval(sync, 30_000)
    return () => {
      window.removeEventListener('aiss-maintenance-change', sync)
      window.clearInterval(id)
    }
  }, [])
  const subjectFor = (alert: FiredAlert): MaintSubject => {
    const host = catalog.find((h) => h.id === alert.hostKey || h.sessionId === alert.hostKey || h.title === alert.hostTitle)
    const keys = [alert.hostKey, alert.hostTitle, host?.id, host?.title].filter((k): k is string => Boolean(k))
    return { keys, tags: host?.tags ?? [] }
  }
  const untilFor = (alert: FiredAlert) => silenceUntil(loadMaintenance(), subjectFor(alert), now)
  void maintTick
  const [highlightCreate, setHighlightCreate] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rulesTab, setRulesTab] = useState<'rules' | 'history'>(rulesDock?.tab ?? 'rules')
  useEffect(() => {
    if (!rulesDock?.nonce) return
    setRulesTab(rulesDock.tab)
    setRulesOpen(true)
  }, [rulesDock?.nonce, rulesDock?.tab])

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

  const rows = useMemo(() => {
    const base = filterAlerts(alerts, { status: filter, host: host || undefined, rule: rule || undefined, q })
    if (!maintOnly) return base
    return base.filter((a) => untilFor(a) != null)
  }, [alerts, filter, host, rule, q, maintOnly, now, maintTick, catalog])
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
    setExplain({ id: Date.now(), sessionId: alert.hostKey, text, host: alert.hostTitle, kind: 'explainAlert', alertId: alert.id })
    appendTimeline({ alertId: alert.id, kind: 'ai.explain', hostKey: alert.hostKey, summary: 'explain' })
    markLoop(alert.id, 'ai')
    window.dispatchEvent(new Event('aiss-loop-mark'))
  }

  const requestFix = (alert: FiredAlert) => {
    setSelectedId(alert.id)
    setNarrowDetail(true)
    if (!aiConfigured) {
      onNeedAi?.()
      return
    }
    const fixes = fixesFor(`explainAlert:${alert.id}`)
    if (fixes && fixes.length > 0) {
      setHighlightCreate(false)
      onCreatePlaybook?.(alert, fixes)
      return
    }
    if (fixes) return
    setHighlightCreate(true)
    void explainThis(alert)
  }

  useEffect(() => {
    const onFix = () => {
      if (!selected) return
      requestFix(selected)
    }
    const onExport = () => {
      if (selected) onExportPostmortem?.(selected)
    }
    window.addEventListener('aiss-fix-playbook', onFix)
    window.addEventListener('aiss-export-postmortem', onExport)
    return () => {
      window.removeEventListener('aiss-fix-playbook', onFix)
      window.removeEventListener('aiss-export-postmortem', onExport)
    }
  }, [selected, onCreatePlaybook, onExportPostmortem, aiConfigured, onNeedAi])

  useEffect(() => {
    if (!autoExplain || !focusId) return
    const alert = alerts.find((a) => a.id === focusId)
    if (alert) void explainThis(alert)
    // Re-run when the tab asks again (nonce), not on every alerts tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExplain, focusNonce])

  useEffect(() => {
    if (!more) return
    const close = () => setMore(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [more])

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
      markLoop(alert.id, 'locate')
      window.dispatchEvent(new Event('aiss-loop-mark'))
      setLocated((prev) => ({ ...prev, [alert.id]: label }))
    } catch (e) {
      setLocateError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="workspace-panel l2-root" data-testid="alert-workbench" data-rules-open={rulesOpen ? 'true' : 'false'}>
      <PanelHeader
        className="l2-head"
        title={
          <>
            {t('l2.title')}
            <span className="l7-meta">{t('l2.activeN', { n: activeN })}</span>
          </>
        }
        actions={
          <>
            <button type="button" data-testid="l2d-open" onClick={() => onOpenMaintenance?.()}>
              {activeWindows(loadMaintenance(), now).length ? t('l2d.badgeN', { n: activeWindows(loadMaintenance(), now).length }) : t('l2d.open')}
            </button>
            <button type="button" onClick={onRules}>
              {t('menu.alertRules')}
            </button>
            <button type="button" onClick={muted ? onUnmute : onMute}>
              {muted ? t('l7.unmute') : t('l2.mute1h')}
            </button>
            <button
              type="button"
              aria-label={t('l7.more')}
              aria-expanded={more}
              onClick={(e) => {
                e.stopPropagation()
                setMore((v) => !v)
              }}
            >
              ⋯
            </button>
            {more ? (
              <div className="l2-prefs" data-testid="l2-prefs" onClick={(e) => e.stopPropagation()}>
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
                <button type="button" onClick={() => { setMore(false); onOpenMaintenance?.() }}>{t('l2d.open')}</button>
              </div>
            ) : null}
          </>
        }
      />
      {muted ? (
        <div className="l7-mute">
          {t('l7.mutedUntil', { time: new Date(mutedUntil!).toLocaleTimeString() })}
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
        <input className="l2-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('l2.search')} aria-label={t('l2.search')} />
        <button type="button" data-testid="l2d-filter" className={maintOnly ? 'is-on' : ''} onClick={() => setMaintOnly((v) => !v)}>
          {t('l2d.filter')}
        </button>
      </div>
      <div className={`l2-body${narrowDetail ? ' is-detail' : ''}`}>
        <div className="l2-list" data-testid="l2-list" role="listbox" aria-label={t('l2.title')} tabIndex={0}
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
              testId="l2-empty"
              icon="alert"
              title={t('pf4.alertTitle')}
              desc={t('pf4.alertDesc')}
              primary={{ label: t('pf4.alertHome'), onClick: () => (onOpenHome ?? onOpenDashboard)() }}
              secondary={[{ label: t('pf4.alertRules'), onClick: onRules }]}
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
                onLocate={() => doLocate(a)}
                onExplain={() => void explainThis(a)}
                explainDisabled={!aiConfigured}
                explainTitle={aiConfigured ? t('a4.interpret') : t('w1.needAi')}
                onFixPlaybook={() => requestFix(a)}
                fixDisabled={!aiConfigured}
                fixTitle={aiConfigured ? t('w1.create') : t('w1.needAi')}
                onMarkDone={() => onHandled(a)}
                onIgnore={() => onDismiss(a)}
                onBoard={onOpenDashboard}
                maintenanceUntil={untilFor(a)}
                onMaintenance={() => onOpenMaintenance?.([a.hostKey])}
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
              <div className="w4-seg">
                <button type="button" className={pane === 'detail' ? 'is-on' : ''} onClick={() => setPane('detail')}>{t('w4.seg.detail')}</button>
                <button type="button" data-testid="w4-timeline-tab" className={pane === 'timeline' ? 'is-on' : ''} onClick={() => setPane('timeline')}>
                  {t('w4.seg.timeline', { n: viewTimeline(selected, ensureFired(selected), loadAudit(), { concurrent: showConcurrent, gates: showGates }).length })}
                </button>
                {pane === 'timeline' ? (
                  <>
                    <Button variant="primary" data-testid="w4-export" onClick={() => onExportPostmortem?.(selected)}>{t('w4.export')}</Button>
                    <button
                      type="button"
                      data-testid="a5-open"
                      onClick={() => {
                        const events = eventsFor(selected.id)
                        if (!aiConfigured) onAiPostmortem?.(selected)
                        else if (isEmptyTimeline(events)) showToast(t('a5.emptyTl'))
                        else onAiPostmortem?.(selected)
                      }}
                    >
                      <Icon name="sparkles" size={14} /> {t('a5.action')}
                    </button>
                  </>
                ) : null}
              </div>
              <LoopNav
                alertId={selected.id}
                aiConfigured={aiConfigured}
                onFocusAlert={() => setSelectedId(selected.id)}
                onLocate={() => doLocate(selected)}
                onAi={() => void explainThis(selected)}
                onNeedAi={() => onNeedAi?.()}
                onPlaybook={() => onCreatePlaybook?.(selected, [])}
                onGenerate={() => {
                  const fixes = fixesFor(`explainAlert:${selected.id}`)
                  if (fixes?.length) onCreatePlaybook?.(selected, fixes)
                  else void explainThis(selected)
                }}
                onOpenSftp={() => onOpenSftp?.(selected)}
              />
              {pane === 'timeline' ? (
                <div data-testid="w4-timeline">
                  <label className="l4-check">
                    <input type="checkbox" checked={showConcurrent} onChange={(e) => setShowConcurrent(e.target.checked)} />
                    {t('w4.showConcurrent')}
                  </label>
                  <label className="l4-check">
                    <input type="checkbox" data-testid="s2b-filter" checked={showGates} onChange={(e) => setShowGates(e.target.checked)} />
                    {t('s2b.filter')}
                  </label>
                  {viewTimeline(selected, eventsFor(selected.id), loadAudit(), { concurrent: showConcurrent, gates: showGates }).map((e) => (
                    <div key={e.id} className={`w4-row${e.concurrent ? ' is-concurrent' : ''}${e.kind === 'gate' ? ' is-gate' : ''}`} data-testid={e.kind === 'gate' ? 'w4-gate-row' : undefined}>
                      <span className="s2b-time">{new Date(e.at).toLocaleTimeString()}</span>
                      <span className="s2b-kind">{e.kind === 'gate' ? t('s2b.k.gate') : e.kind}</span>
                      {e.kind === 'gate' && e.gateResult ? <span className={`s2b-chip is-${e.gateResult}`}>{e.gateResult}</span> : null}
                      <span className="s2b-sum" title={e.summary}>{e.summary}</span>
                    </div>
                  ))}
                  <input
                    value={note}
                    placeholder={t('w4.addNote')}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || e.shiftKey) return
                      const text = note.trim()
                      if (!text) return
                      appendTimeline({ alertId: selected.id, kind: 'note', hostKey: selected.hostKey, summary: text.slice(0, 500) })
                      setNote('')
                    }}
                  />
                </div>
              ) : null}
              {pane === 'detail' ? (
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
                <Button variant="primary"
                  data-testid="l2-locate"
                  disabled={locating}
                  onClick={() => doLocate(selected)}
                >
                  {locating ? t('l2.connecting', { host: selected.hostTitle }) : t('l2.locate')}
                </Button>
                <button type="button" title={t('l2.openTerminal')} onClick={() => onOpenTerminal(selected)}>
                  <Icon name="keyboard" size={14} />
                  <span className="l2-lbl">{t('l2.openTerminal')}</span>
                </button>
                <button type="button" title={t('menu.resourceMonitor')} onClick={() => onOpenMonitor(selected)}>
                  <Icon name="activity" size={14} />
                  <span className="l2-lbl">{t('menu.resourceMonitor')}</span>
                </button>
                <button type="button" title={t('tab.toolbox')} onClick={() => onOpenToolbox(selected)}>
                  <Icon name="wrench" size={14} />
                  <span className="l2-lbl">{t('tab.toolbox')}</span>
                </button>
                <button type="button" data-testid="l2-explain" title={aiConfigured ? t('a4.interpret') : t('w1.needAi')} disabled={!aiConfigured} onClick={() => void explainThis(selected)}>
                  <Icon name="sparkles" size={14} /> {t('a4.interpret')}
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
                    onInsert={(sid, command) => {
                      appendTimeline({ alertId: selected.id, kind: 'command.insert', hostKey: selected.hostKey, summary: command })
                      onInsert(sid, command)
                    }}
                    onRun={(_sid, command) => {
                      appendTimeline({ alertId: selected.id, kind: 'command.run', hostKey: selected.hostKey, summary: command })
                      onRun(selected, command)
                    }}
                    onCreatePlaybook={(fixes) => onCreatePlaybook?.(selected, fixes)}
                    highlightCreate={highlightCreate}
                  />
                ) : null}
                {explainAlertId === selected.id && aiConfigured ? (
                  <button type="button" onClick={() => void explainThis(selected)}>
                    {t('l2.reanalyze')}
                  </button>
                ) : null}
              </div>
              </>
              ) : null}
            </>
          )}
        </div>
        {rulesOpen ? (
          <AlertRulesModal
            open
            initial={ruleState}
            history={alerts}
            initialTab={rulesTab}
            onClose={() => setRulesOpen(false)}
            onSave={onSaveRules}
            onClearHistory={onClearHistory}
            onMute1h={onMute}
            onLocate={onLocate}
            onInterpret={(alert) => void explainThis(alert)}
            onIgnore={onDismiss}
          />
        ) : null}
      </div>
    </div>
  )
}
