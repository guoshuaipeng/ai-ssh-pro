import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Select from './ui/Select'
import type { FiredAlert } from '../../../shared/alert-rules'
import { primaryAlert } from '../../../shared/alert-locate'
import type { ResourceSnapshot } from '../../../shared/resource-monitor'
import { metricHostKey, readCachedMetrics, staleAge, staleHintKey, writeCachedMetrics, type CachedMetrics } from '../../../shared/metric-cache'
import { formatBytes, formatUptime } from '../../../shared/resource-monitor'
import { useI18n } from '../lib/i18n'
import EmptyState from './EmptyState'
import Icon from './Icon'
import type { BatchSessionOption } from './BatchExecuteModal'
import { friendlyErrorMessage } from '../lib/friendly-error'
import PanelHeader from './ui/PanelHeader'

type Props = {
  sessions: BatchSessionOption[]
  onClose: () => void
  onOpenMonitor: (sessionId: string) => void
  onOpenToolbox?: (sessionId: string) => void
  onConnectTerminal?: (sessionId: string) => void
  /** sessionIds currently in alert */
  alertSessionIds?: Set<string> | string[]
  onOpenAlertRules?: () => void
  onOpenInspect?: () => void
  sortAlertsFirst?: boolean
  /** active alerts used for 定位 / AI 解读 (O4 / A4) */
  alerts?: FiredAlert[]
  onLocate?: (alert: FiredAlert) => void
  onInterpret?: (alert: FiredAlert) => void
  onOpenWorkbench?: (alert: FiredAlert) => void
  visibleSession?: (sessionId: string) => boolean
  scopeSlot?: ReactNode
  onHide?: (sessionId: string) => void
}

type CardState = {
  sessionId: string
  title: string
  snap: ResourceSnapshot | null
  error: string | null
  /** Last-known metrics shown until the first live read lands (never a loading state). */
  cached: CachedMetrics | null
  cacheKey: string
  history: number[]
}

const REFRESH_MS = 10000
const MAX_HOSTS = 30

function level(p: number): 'ok' | 'warn' | 'bad' {
  return p >= 85 ? 'bad' : p >= 70 ? 'warn' : 'ok'
}

function MiniSpark({ values }: { values: number[] }) {
  const w = 72
  const h = 28
  if (!values.length) return <svg width={w} height={h} className="o1-spark" />
  const max = Math.max(100, ...values)
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w
      const y = h - (v / max) * (h - 4) - 2
      return `${x},${y}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="o1-spark" viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function Bar({ label, percent }: { label: string; percent: number | null }) {
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  return (
    <div className="o1-bar-row">
      <span>{label}</span>
      <div className="o1-bar">
        <div className={`o1-fill o1-${level(p)}`} style={{ width: `${p}%` }} />
      </div>
      <span className={`o1-pct o1-${level(p)}`}>{percent == null ? '—' : `${Math.round(percent)}%`}</span>
    </div>
  )
}

/** O1: multi-host resource dashboard as a center tab. */
export default function MultiHostDashboard({ sessions, onClose, onOpenMonitor, onOpenToolbox, onConnectTerminal, alertSessionIds, onOpenAlertRules, onOpenInspect, sortAlertsFirst, alerts, onLocate, onInterpret, onOpenWorkbench, visibleSession, scopeSlot, onHide }: Props) {
  const { t } = useI18n()
  const [sort, setSort] = useState<'name' | 'cpu' | 'mem' | 'disk' | 'alert'>('name')
  const alertSet = alertSessionIds instanceof Set ? alertSessionIds : new Set(alertSessionIds ?? [])
  const [cards, setCards] = useState<CardState[]>([])

  const targets = useMemo(
    () => sessions.filter((s) => (visibleSession ? visibleSession(s.sessionId) : true)).slice(0, MAX_HOSTS),
    [sessions, visibleSession]
  )

  useEffect(() => {
    setCards((prev) => {
      const map = new Map(prev.map((c) => [c.sessionId, c]))
      return targets.map((s) => {
        const old = map.get(s.sessionId)
        return (
          old ?? {
            sessionId: s.sessionId,
            title: s.title,
            snap: null,
            error: null,
            cached: readCachedMetrics(metricHostKey(s)),
            cacheKey: metricHostKey(s),
            history: []
          }
        )
      })
    })
  }, [targets])

  const loadOne = useCallback(async (sessionId: string) => {
    try {
      const r = await window.aiss.workspace.resources(sessionId)
      setCards((prev) =>
        prev.map((c) => {
          if (c.sessionId !== sessionId) return c
          writeCachedMetrics(c.cacheKey, {
            cpu: r.cpuPercent ?? null,
            mem: r.mem?.percent ?? null,
            disk: r.disks?.length ? Math.max(...r.disks.map((d) => d.percent)) : null,
            load: r.load ?? null
          })
          return c
        }).map((c) =>
          c.sessionId === sessionId
            ? {
                ...c,
                snap: r,
                error: null,
                history: [...c.history, r.cpuPercent ?? 0].slice(-60)
              }
            : c
        )
      )
    } catch (e) {
      const msg = friendlyErrorMessage(e)
      setCards((prev) => prev.map((c) => (c.sessionId === sessionId ? { ...c, error: msg } : c)))
    }
  }, [])

  useEffect(() => {
    if (!targets.length) return
    for (const s of targets) void loadOne(s.sessionId)
    const timer = setInterval(() => {
      for (const s of targets) void loadOne(s.sessionId)
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [targets, loadOne])

  const shown = useMemo(() => {
    const list = [...cards]
    list.sort((a, b) => {
      if (sort === 'alert' || sortAlertsFirst) {
        const aa = alertSet.has(a.sessionId) ? 1 : 0
        const bb = alertSet.has(b.sessionId) ? 1 : 0
        if (aa !== bb) return bb - aa
        if (sort === 'alert') return a.title.localeCompare(b.title)
      }
      if (sort === 'name') return a.title.localeCompare(b.title)
      const av =
        sort === 'cpu'
          ? a.snap?.cpuPercent ?? -1
          : sort === 'mem'
            ? a.snap?.mem?.percent ?? -1
            : Math.max(0, ...(a.snap?.disks?.map((d) => d.percent) ?? [-1]))
      const bv =
        sort === 'cpu'
          ? b.snap?.cpuPercent ?? -1
          : sort === 'mem'
            ? b.snap?.mem?.percent ?? -1
            : Math.max(0, ...(b.snap?.disks?.map((d) => d.percent) ?? [-1]))
      return bv - av
    })
    return list
  }, [cards, sort, alertSet, sortAlertsFirst])

  return (
    <div className="workspace-panel workspace-panel--o1" data-testid="multi-host-dashboard">
      <PanelHeader
        actions={
          <>
            {scopeSlot}
            <label className="o1-sort">
              {t('o1.sort')}{' '}
              <Select testId="o1-sort" ariaLabel={t('o1.sort')} value={sort} options={[{ value: 'name', label: t('o1.sortName') }, { value: 'alert', label: t('o2.sortAlert') }, { value: 'cpu', label: 'CPU' }, { value: 'mem', label: t('rm.mem') }, { value: 'disk', label: t('o1.disk') }]} onChange={(v) => setSort(v as typeof sort)} />
            </label>
            {onOpenAlertRules ? (
              <button type="button" onClick={onOpenAlertRules}>{t('o2.rulesTitle')}</button>
            ) : null}
            {onOpenInspect ? (
              <button type="button" onClick={onOpenInspect}>{t('a3.short')}</button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                for (const s of targets) void loadOne(s.sessionId)
              }}
            >
              {t('rm.refresh')}
            </button>
          </>
        }
      />
      <div className="workspace-panel-body">
        {targets.length === 0 ? (
          <EmptyState
            testId="o1-empty"
            icon={<Icon name="activity" size={32} />}
            title={t('o1.emptyTitle')}
            desc={t('o1.emptyDesc')}
          />
        ) : (
          <>
            {sessions.length > MAX_HOSTS ? <p className="o1-limit">{t('o1.limit', { max: MAX_HOSTS })}</p> : null}
            <div className="o1-grid">
              {shown.map((c) => {
                const diskMax = c.snap?.disks?.length ? Math.max(...c.snap.disks.map((d) => d.percent)) : null
                return (
                  <article
                    key={c.sessionId}
                    className={`o1-card${c.error ? ' is-err' : ''}${alertSet.has(c.sessionId) ? ' is-alert' : ''}`}
                    data-testid="o1-card"
                    onClick={() => onOpenMonitor(c.sessionId)}
                    onDoubleClick={() => onConnectTerminal?.(c.sessionId)}
                  >
                    <header className="o1-card-head">
                      <strong className="o1-card-title" title={c.title}>
                        {c.title}
                      </strong>
                      {alertSet.has(c.sessionId) ? <span className="o1-alert-badge" data-testid="o1-alert-badge">{t('o2.badge')}</span> : null}
                      <MiniSpark values={c.history} />
                    </header>
                    {!c.snap && !c.error ? (
                      <>
                        {/* M17: no loading state — last-known numbers (muted hint) or a calm "—". */}
                        <Bar label="CPU" percent={c.cached?.cpu ?? null} />
                        <Bar label={t('rm.mem')} percent={c.cached?.mem ?? null} />
                        <Bar label={t('o1.disk')} percent={c.cached?.disk ?? null} />
                        {c.cached ? (
                          <p className="o1-muted o1-stale" data-testid="o1-stale-hint">
                            {t(staleHintKey(staleAge(c.cached.at, Date.now())), { n: staleAge(c.cached.at, Date.now()).n })}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {c.error ? (
                      <p className="o1-err">
                        {c.error}{' '}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            void loadOne(c.sessionId)
                          }}
                        >
                          {t('upd.retry')}
                        </button>
                      </p>
                    ) : null}
                    {c.snap ? (
                      <>
                        <Bar label="CPU" percent={c.snap.cpuPercent} />
                        <Bar label={t('rm.mem')} percent={c.snap.mem?.percent ?? null} />
                        <Bar label={t('o1.disk')} percent={diskMax} />
                        <footer className="o1-card-foot">
                          <span>
                            {c.snap.load ? `load ${c.snap.load[0]}` : ''}
                            {c.snap.uptimeSec != null ? ` · ${formatUptime(c.snap.uptimeSec)}` : ''}
                          </span>
                          {c.snap.mem ? <span>{formatBytes(c.snap.mem.used)}</span> : null}
                        </footer>
                      </>
                    ) : null}
                    <div className="o1-card-actions">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenMonitor(c.sessionId)
                        }}
                      >
                        {t('menu.resourceMonitor')}
                      </button>
                      {onHide ? (
                        <button
                          type="button"
                          data-testid="dash-remove"
                          onClick={(e) => {
                            e.stopPropagation()
                            onHide(c.sessionId)
                          }}
                        >
                          {t('dash.remove')}
                        </button>
                      ) : null}
                      {onOpenToolbox ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenToolbox(c.sessionId)
                          }}
                        >
                          {t('tab.toolbox')}
                        </button>
                      ) : null}
                      {alertSet.has(c.sessionId) && onOpenWorkbench ? (
                        <button
                          type="button"
                          data-testid="o1-open-workbench"
                          onClick={(e) => {
                            e.stopPropagation()
                            const hit = primaryAlert(alerts ?? [], c.sessionId)
                            if (hit) onOpenWorkbench(hit)
                          }}
                        >
                          {t('l2.title')}
                        </button>
                      ) : null}
                      {alertSet.has(c.sessionId) && onLocate ? (
                        <button
                          type="button"
                          data-testid="o4-locate"
                          onClick={(e) => {
                            e.stopPropagation()
                            const hit = primaryAlert(alerts ?? [], c.sessionId)
                            if (hit) onLocate(hit)
                          }}
                        >
                          {t('o4.locate')}
                        </button>
                      ) : null}
                      {alertSet.has(c.sessionId) && onInterpret ? (
                        <button
                          type="button"
                          data-testid="a4-interpret"
                          onClick={(e) => {
                            e.stopPropagation()
                            const hit = primaryAlert(alerts ?? [], c.sessionId)
                            if (hit) onInterpret(hit)
                          }}
                        >
                          {t('a4.interpret')}
                        </button>
                      ) : null}
                    </div>
                    {alertSet.has(c.sessionId) && onInterpret ? (
                      <p
                        className="a4-privacy"
                        data-testid="a4-privacy-action"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t('a4.privacy')}
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
