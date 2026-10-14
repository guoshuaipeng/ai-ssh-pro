import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FiredAlert } from '@shared/alert-rules'
import type { DashScope } from '@shared/dashboard-scope'
import { pickHealthHosts } from '@shared/dashboard-scope'
import type { ProtectionLevel } from '@shared/protection'
import { useI18n } from '../lib/i18n'
import { AlertLine } from './AlertLine'
import EmptyState from './EmptyState'
import ScopePicker from './ScopePicker'

export type HomeHost = {
  profileId: string
  title: string
  host: string
  sessionId?: string
  online: boolean
  latencyMs?: number | null
  protection: ProtectionLevel
  demo?: boolean
  alerting: boolean
  folderId?: string
}

type Snap = { cpu: number | null; mem: number | null; disk: number | null; error: string | null; loading: boolean }

type MenuState = { x: number; y: number; profileId: string } | null

export default function OpsHomeTab({
  hosts,
  alerts,
  mutedUntil,
  scope,
  folders,
  activeCount,
  taskDone,
  taskTotal,
  showTasks,
  onScope,
  onNewConnection,
  onOpenDashboard,
  onOpenWorkbench,
  onOpenMonitor,
  onConnect,
  onLocate,
  onExplain,
  onDismiss,
  onUnmute,
  onRules,
  onInspect,
  onStartup,
  onImport,
  onDemo,
  onTour,
  onTasks,
  onGuard,
  onCheckUpdate,
  onPlaybook
}: {
  hosts: HomeHost[]
  alerts: FiredAlert[]
  mutedUntil: number | null
  scope: DashScope
  folders: { id: string; name: string }[]
  activeCount: number
  taskDone: number
  taskTotal: number
  showTasks: boolean
  onScope: (s: DashScope) => void
  onNewConnection: () => void
  onOpenDashboard: () => void
  onOpenWorkbench: (alertId?: string) => void
  onOpenMonitor: (host: HomeHost) => void
  onConnect: (host: HomeHost) => void
  onLocate: (a: FiredAlert) => void
  onExplain: (a: FiredAlert) => void
  onDismiss: (a: FiredAlert) => void
  onUnmute: () => void
  onRules: () => void
  onInspect: () => void
  onStartup: () => void
  onImport: () => void
  onDemo: () => void
  onTour: () => void
  onTasks: () => void
  onGuard: (profileId: string) => void
  onCheckUpdate: () => void
  onPlaybook: () => void
}) {
  const { t } = useI18n()
  const [snaps, setSnaps] = useState<Record<string, Snap>>({})
  const [menu, setMenu] = useState<MenuState>(null)
  const [more, setMore] = useState(false)
  const [inboxFilter, setInboxFilter] = useState<'active' | 'all' | 'ignored'>('active')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [retryNonce, setRetryNonce] = useState(0)

  const ranked = useMemo(() => pickHealthHosts(hosts, (h) => h.alerting, 8), [hosts])
  const inbox = useMemo(() => {
    const rows = alerts.filter((a) => (inboxFilter === 'all' ? true : a.status === (inboxFilter === 'ignored' ? 'ignored' : 'active')))
    return rows.slice(0, 40)
  }, [alerts, inboxFilter])

  const loadSnaps = useCallback(async (ids: string[]) => {
    await Promise.all(
      ids.map(async (sessionId) => {
        try {
          const r = await window.aiss.workspace.resources(sessionId)
          const disk = r.disks?.length ? Math.max(...r.disks.map((d) => d.percent)) : null
          setSnaps((prev) => ({
            ...prev,
            [sessionId]: {
              cpu: r.cpuPercent ?? null,
              mem: r.mem?.percent ?? null,
              disk,
              error: null,
              loading: false
            }
          }))
        } catch (e) {
          setSnaps((prev) => ({
            ...prev,
            [sessionId]: {
              cpu: prev[sessionId]?.cpu ?? null,
              mem: prev[sessionId]?.mem ?? null,
              disk: prev[sessionId]?.disk ?? null,
              error: e instanceof Error ? e.message : String(e),
              loading: false
            }
          }))
        }
      })
    )
  }, [])

  useEffect(() => {
    const ids = ranked.shown.map((h) => h.sessionId).filter((id): id is string => Boolean(id))
    if (!ids.length) return
    let timer = 0
    let stop = false
    const tick = () => {
      if (stop) return
      void loadSnaps(ids)
      const wait = document.hidden ? 60000 : 10000
      timer = window.setTimeout(tick, wait)
    }
    tick()
    const onVis = () => {
      window.clearTimeout(timer)
      tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [ranked.shown, loadSnaps, retryNonce])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!menu && !more) return
    const close = () => {
      setMenu(null)
      setMore(false)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu, more])

  if (hosts.length === 0 && scope.mode === 'all') {
    return (
      <div className="workspace-panel l7-root" data-testid="ops-home">
        <div className="workspace-panel-toolbar l7-head">
          <h2 className="workspace-panel-title">{t('l7.title')}</h2>
        </div>
        <div className="workspace-panel-body">
          <EmptyState
            testId="l7-empty"
            icon="▣"
            title={t('l7.emptyTitle')}
            desc={t('l7.emptyDesc')}
            primary={{ label: t('l7.newConnection'), onClick: onNewConnection, testId: 'l7-new-connection' }}
            secondary={[
              { label: t('l7.import'), onClick: onImport },
              { label: t('l7.tryDemo'), onClick: onDemo, testId: 'l7-try-demo' }
            ]}
          >
            <div className="l7-empty-links">
              <button type="button" onClick={onTour}>
                {t('l7.tour')}
              </button>
              <button type="button" onClick={onPlaybook}>
                {t('l7.aboutPlaybooks')}
              </button>
            </div>
          </EmptyState>
        </div>
      </div>
    )
  }

  const muted = mutedUntil != null && mutedUntil > now
  const primaryIsAlerts = activeCount > 0

  return (
    <div className="workspace-panel l7-root" data-testid="ops-home">
      <div className="workspace-panel-toolbar l7-head">
        <h2 className="workspace-panel-title">
          {t('l7.title')}
          <span className="l7-meta">
            {t('l7.meta', { n: hosts.length, a: activeCount })}
          </span>
        </h2>
        <div className="workspace-panel-actions l7-head-actions">
          {primaryIsAlerts ? (
            <button type="button" className="primary" data-testid="l7-primary" onClick={() => onOpenWorkbench()}>
              {t('l7.workAlerts')}
            </button>
          ) : (
            <button type="button" className="primary" data-testid="l7-primary" onClick={onNewConnection}>
              {t('l7.newConnection')}
            </button>
          )}
          <button type="button" onClick={onOpenDashboard}>
            {t('l7.openDashboard')}
          </button>
          <button
            type="button"
            aria-label={t('l7.more')}
            onClick={(e) => {
              e.stopPropagation()
              setMore((v) => !v)
            }}
          >
            ⋯
          </button>
          {more ? (
            <div className="l7-more" role="menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={onRules}>
                {t('menu.alertRules')}
              </button>
              <button type="button" onClick={onPlaybook}>
                {t('l7.playbooks')}
              </button>
              <button type="button" onClick={onInspect}>
                {t('a3.short')}
              </button>
              <button type="button" onClick={onStartup}>
                {t('menu.startupSettings')}
              </button>
              <button type="button" onClick={() => setRetryNonce((n) => n + 1)}>
                {t('l7.refresh')}
              </button>
              <div className="l7-rail-collapsed">
                <button type="button" onClick={onNewConnection}>
                  {t('l7.newConnection')}
                </button>
                <button type="button" onClick={onImport}>
                  {t('l7.import')}
                </button>
                <button type="button" onClick={onCheckUpdate}>
                  {t('menu.checkUpdate')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="l7-body">
        <section className="l7-col l7-health" aria-label={t('l7.health')}>
          <header className="l7-col-head">
            <strong>{t('l7.health')}</strong>
            <ScopePicker scope={scope} folders={folders} hosts={hosts.map((h) => ({ id: h.profileId, title: h.title }))} onChange={onScope} />
          </header>
          {ranked.shown.length === 0 ? (
            <p className="l7-muted">{t('l7.scopeEmpty')}</p>
          ) : (
            <div className="l7-cards">
              {ranked.shown.map((h) => {
                const snap = h.sessionId ? snaps[h.sessionId] : undefined
                return (
                  <article
                    key={h.profileId}
                    className={`l7-card${h.alerting ? ' is-alert' : ''}${snap?.error ? ' is-err' : ''}`}
                    data-testid="l7-card"
                    title={h.title}
                    onClick={() => onOpenMonitor(h)}
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      onConnect(h)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, profileId: h.profileId })
                    }}
                  >
                    <div className="l7-card-top">
                      <span className={`l7-dot${h.online ? ' is-on' : ''}`} aria-hidden />
                      <span className="l7-card-name">{h.title}</span>
                      {h.protection !== 'normal' ? (
                        <span className={`prot-badge prot-badge--${h.protection}`}>{t(h.protection === 'production' ? 'l4.production' : 'l4.readonly')}</span>
                      ) : null}
                      {h.demo ? <span className="demo-badge">{t('l7.demo')}</span> : null}
                    </div>
                    <div className="l7-card-lat">{h.latencyMs != null ? `${h.latencyMs} ms` : h.online ? '—' : t('l7.offline')}</div>
                    {snap?.error ? (
                      <div className="l7-card-err">
                        <span>{t('l7.unreachable')}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (h.sessionId) {
                              setSnaps((prev) => ({ ...prev, [h.sessionId!]: { ...(prev[h.sessionId!] ?? snap), loading: true, error: null } }))
                              void loadSnaps([h.sessionId])
                            } else onConnect(h)
                          }}
                        >
                          {t('upd.retry')}
                        </button>
                      </div>
                    ) : (
                      <div className="l7-metrics">
                        <Metric label="CPU" value={snap?.cpu ?? null} />
                        <Metric label={t('l7.mem')} value={snap?.mem ?? null} />
                        <Metric label={t('l7.disk')} value={snap?.disk ?? null} />
                      </div>
                    )}
                    {h.alerting ? <span className="l7-alert-dot" title={t('o2.badge')} /> : null}
                  </article>
                )
              })}
            </div>
          )}
          {ranked.more > 0 ? (
            <p className="l7-more-hosts">
              {t('l7.moreHosts', { n: ranked.more })}{' '}
              <button type="button" onClick={onOpenDashboard}>
                {t('l7.viewAll')}
              </button>
            </p>
          ) : (
            <button type="button" className="l7-open-dash" onClick={onOpenDashboard}>
              {t('l7.openDashboard')}
            </button>
          )}
        </section>

        <section className="l7-col l7-inbox" aria-label={t('l7.inbox')}>
          <header className="l7-col-head">
            <strong>{t('l7.inbox')}</strong>
            <button type="button" onClick={() => onOpenWorkbench()}>
              {t('l7.openWorkbench')}
            </button>
          </header>
          {muted ? (
            <div className="l7-mute" data-testid="l7-mute">
              <span>{t('l7.mutedUntil', { time: new Date(mutedUntil!).toLocaleTimeString() })}</span>
              <button type="button" onClick={onUnmute}>
                {t('l7.unmute')}
              </button>
            </div>
          ) : null}
          <div className="l7-filters" role="tablist">
            {(['active', 'all', 'ignored'] as const).map((key) => (
              <button key={key} type="button" className={inboxFilter === key ? 'is-on' : ''} onClick={() => setInboxFilter(key)}>
                {t(key === 'active' ? 'l2.active' : key === 'ignored' ? 'l2.dismissed' : 'l2.all')}
              </button>
            ))}
          </div>
          {inbox.length === 0 ? (
            <EmptyState
              compact
              testId="l7-inbox-empty"
              icon="✓"
              title={t('l7.noAlerts')}
              primary={{ label: t('l2.viewHistory'), onClick: () => onOpenWorkbench() }}
              secondary={[{ label: t('menu.alertRules'), onClick: onRules }]}
            />
          ) : (
            <div className="l7-rows" role="listbox" aria-label={t('l7.inbox')}>
              {inbox.map((a) => (
                <div key={a.id}>
                  <AlertLine
                    alert={a}
                    compact
                    now={now}
                    selected={expanded === a.id}
                    onSelect={() => setExpanded((id) => (id === a.id ? null : a.id))}
                    onOpen={() => onLocate(a)}
                    onLocate={() => onLocate(a)}
                    onExplain={() => onExplain(a)}
                  />
                  {expanded === a.id ? (
                    <div className="l7-expand">
                      <span>{t('l7.expandHint')}</span>
                      <button type="button" onClick={() => onDismiss(a)}>
                        {t('l2.dismiss')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <p className="a4-privacy l7-privacy" data-testid="l7-privacy">
            {t('a4.privacy')}
          </p>
        </section>

        <aside className="l7-col l7-rail" aria-label={t('l7.shortcuts')}>
          <strong>{t('l7.shortcuts')}</strong>
          <button type="button" onClick={onNewConnection}>
            {t('l7.newConnection')}
          </button>
          <button type="button" onClick={onOpenDashboard}>
            {t('l7.openDashboard')}
          </button>
          <button type="button" onClick={onPlaybook}>
            {t('l7.runPlaybook')}
          </button>
          <button type="button" onClick={onImport}>
            {t('l7.import')}
          </button>
          <button type="button" onClick={onCheckUpdate}>
            {t('menu.checkUpdate')}
          </button>
          <div className="l7-rail-split" />
          <strong>{t('l7.recentPlaybooks')}</strong>
          <button type="button" className="l7-soon-link" disabled title={t('l7.soon')}>
            {t('l7.sampleRestart')}
            <span>{t('l7.soon')}</span>
          </button>
          <button type="button" className="l7-soon-link" disabled title={t('l7.soon')}>
            {t('l7.sampleDisk')}
            <span>{t('l7.soon')}</span>
          </button>
          <button type="button" onClick={onPlaybook}>
            {t('l7.allPlaybooks')}
          </button>
          {showTasks ? (
            <button type="button" className="l7-tasks" data-testid="l7-tasks" onClick={onTasks}>
              {t('l7.tasks', { done: taskDone, total: taskTotal })}
            </button>
          ) : null}
        </aside>
      </div>
      {menu ? (
        <div className="session-context-menu" style={{ left: menu.x, top: menu.y }} role="menu" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="session-context-menu-item"
            onClick={() => {
              const host = hosts.find((h) => h.profileId === menu.profileId)
              setMenu(null)
              if (host) onOpenMonitor(host)
            }}
          >
            {t('menu.resourceMonitor')}
          </button>
          <button
            type="button"
            className="session-context-menu-item"
            onClick={() => {
              const host = hosts.find((h) => h.profileId === menu.profileId)
              setMenu(null)
              if (host) onConnect(host)
            }}
          >
            {t('l7.connect')}
          </button>
          <button
            type="button"
            className="session-context-menu-item"
            onClick={() => {
              const host = hosts.find((h) => h.profileId === menu.profileId)
              setMenu(null)
              const hit = alerts.find((a) => a.status === 'active' && host?.sessionId && a.hostKey === host.sessionId)
              onOpenWorkbench(hit?.id)
            }}
          >
            {t('l7.viewInWorkbench')}
          </button>
          <button
            type="button"
            className="session-context-menu-item"
            onClick={() => {
              const id = menu.profileId
              setMenu(null)
              onGuard(id)
            }}
          >
            {t('l4.menu')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | null }) {
  const p = value == null ? 0 : Math.max(0, Math.min(100, value))
  const tone = p >= 85 ? 'bad' : p >= 70 ? 'warn' : 'ok'
  return (
    <div className="l7-metric">
      <span>{label}</span>
      <span className="l7-bar">
        <span className={`l7-fill l7-${tone}`} style={{ width: `${p}%` }} />
      </span>
      <span>{value == null ? '—' : `${Math.round(value)}%`}</span>
    </div>
  )
}
