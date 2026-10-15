import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import type { FiredAlert } from '@shared/alert-rules'
import type { DashScope } from '@shared/dashboard-scope'
import { pickHealthHosts } from '@shared/dashboard-scope'
import { selectProbeTargets, type HealthProbeResult, type ProbePrefs } from '@shared/health-probe'
import type { ProtectionLevel } from '@shared/protection'
import { useI18n } from '../lib/i18n'
import { useHealthSampling, type SampleHost } from '../lib/health-sampling'
import { AlertLine } from './AlertLine'
import EmptyState from './EmptyState'
import HealthProbeFields from './HealthProbeFields'
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
  via?: string
  recent?: boolean
  pinned?: boolean
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
  onPlaybook,
  onRestoreSync,
  recentPlaybooks,
  onOpenRecent,
  onOpenSftp,
  onSyncFolder,
  probePrefs,
  onProbePrefs,
  probeGrouped,
  probeActive,
  probeNonce,
  onSample,
  onSweep,
  onRelease
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
  onRestoreSync?: () => void
  recentPlaybooks?: Array<{ id: string; name: string }>
  onOpenRecent?: (id: string) => void
  onOpenSftp?: () => void
  onSyncFolder?: () => void
  probePrefs: ProbePrefs
  onProbePrefs: (patch: Partial<ProbePrefs>) => void
  probeGrouped: boolean
  probeActive: boolean
  probeNonce: number
  onSample: (host: SampleHost) => Promise<HealthProbeResult>
  onSweep: (idleMs: number) => void
  onRelease: () => void
}) {
  const { t } = useI18n()
  const [snaps, setSnaps] = useState<Record<string, Snap>>({})
  const [menu, setMenu] = useState<MenuState>(null)
  const [more, setMore] = useState(false)
  const [inboxFilter, setInboxFilter] = useState<'active' | 'all' | 'ignored'>('active')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [retryNonce, setRetryNonce] = useState(0)
  const [probeOpen, setProbeOpen] = useState(false)
  const sampleHosts = useMemo(
    () =>
      hosts.map((h, order) => ({
        profileId: h.profileId,
        folderId: h.folderId,
        alerting: h.alerting,
        order,
        recent: h.recent,
        pinned: h.pinned,
        title: h.title,
        demo: h.demo,
        sessionId: h.sessionId
      })),
    [hosts]
  )
  const probeTargets = useMemo(
    () => (probePrefs.enabled ? selectProbeTargets(sampleHosts, probePrefs, { grouped: probeGrouped }) : []),
    [sampleHosts, probePrefs, probeGrouped, probePrefs.enabled]
  )
  const cardSource = useMemo(() => {
    if (!probePrefs.enabled) return hosts
    const ids = new Set(probeTargets.map((t) => t.profileId))
    return hosts.filter((h) => ids.has(h.profileId))
  }, [hosts, probePrefs.enabled, probeTargets])
  const ranked = useMemo(() => pickHealthHosts(cardSource, (h) => h.alerting, 8), [cardSource])
  const visibleSamples = useMemo<SampleHost[]>(
    () =>
      ranked.shown.map((h) => ({
        profileId: h.profileId,
        title: h.title,
        demo: h.demo,
        sessionId: h.sessionId
      })),
    [ranked.shown]
  )
  const sampling = useHealthSampling({
    enabled: probePrefs.enabled,
    hosts: visibleSamples,
    maxConcurrent: probePrefs.maxConcurrent,
    active: probeActive,
    nonce: probeNonce + retryNonce,
    onSample,
    onSweep,
    onRelease
  })
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
    if (probePrefs.enabled) return
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
  }, [ranked.shown, loadSnaps, retryNonce, probePrefs.enabled])

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!menu && !more && !probeOpen) return
    const close = () => {
      setMenu(null)
      setMore(false)
      setProbeOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, more, probeOpen])

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
              {onRestoreSync ? (
                <button type="button" onClick={onRestoreSync}>
                  {t('l7.restoreSync')}
                </button>
              ) : null}
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
          {primaryIsAlerts ? (
            <button type="button" data-testid="l7-open-dashboard" onClick={onOpenDashboard}>
              {t('l7.openDashboard')}
            </button>
          ) : null}
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
            <div className="l7-more" role="menu" onClick={(e) => e.stopPropagation()}>
              {!primaryIsAlerts ? (
                <button type="button" onClick={() => { setMore(false); onOpenDashboard() }}>
                  {t('l7.openDashboard')}
                </button>
              ) : null}
              <button type="button" onClick={() => { setMore(false); onRules() }}>
                {t('menu.alertRules')}
              </button>
              <button type="button" onClick={() => { setMore(false); onPlaybook() }}>
                {t('l7.playbooks')}
              </button>
              <button type="button" onClick={() => { setMore(false); onInspect() }}>
                {t('a3.short')}
              </button>
              <button type="button" onClick={() => { setMore(false); onStartup() }}>
                {t('menu.startupSettings')}
              </button>
              <button type="button" onClick={() => { setMore(false); setRetryNonce((n) => n + 1) }}>
                {t('l7.refresh')}
              </button>
              <button
                type="button"
                data-testid="l7b-open-settings"
                onClick={() => {
                  setMore(false)
                  setProbeOpen(true)
                }}
              >
                {t('l7b.settings')}
              </button>
              <div className="l7-rail-collapsed">
                <button type="button" onClick={() => { setMore(false); onNewConnection() }}>
                  {t('l7.newConnection')}
                </button>
                <button type="button" onClick={() => { setMore(false); onOpenDashboard() }}>
                  {t('l7.openDashboard')}
                </button>
                <button type="button" data-testid="l7-open-sftp" onClick={() => { setMore(false); onOpenSftp?.() }}>
                  {t('l7.shortcut.sftp')}
                </button>
                <button type="button" data-testid="l7-sync-folder" onClick={() => { setMore(false); onSyncFolder?.() }}>
                  {t('l7.shortcut.syncFolder')}
                </button>
                <button type="button" onClick={() => { setMore(false); onPlaybook() }}>
                  {t('l7.runPlaybook')}
                </button>
                <button type="button" onClick={() => { setMore(false); onImport() }}>
                  {t('l7.import')}
                </button>
                <button type="button" onClick={() => { setMore(false); onCheckUpdate() }}>
                  {t('menu.checkUpdate')}
                </button>
              </div>
            </div>
          ) : null}
          {probeOpen ? (
            <div className="l7-more l7b-settings" data-testid="l7b-settings" role="dialog" aria-label={t('l7b.settings')} onClick={(e) => e.stopPropagation()}>
              <HealthProbeFields prefs={probePrefs} onChange={onProbePrefs} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="l7-body">
        <section className="l7-col l7-health" aria-label={t('l7.health')}>
          <header className="l7-col-head">
            <strong>{t('l7.health')}</strong>
            <ScopePicker scope={scope} folders={folders} hosts={hosts.map((h) => ({ id: h.profileId, title: h.title }))} onChange={onScope} />
            <button type="button" data-testid="l7-health-refresh" onClick={() => setRetryNonce((n) => n + 1)}>
              {t('l7.refresh')}
            </button>
            <span className="l7b-head-status">
              {probePrefs.enabled
                ? `${t('l7b.autoOn')} · ${sampling.lastOkAt ? (now - sampling.lastOkAt < 5000 ? t('l7b.justNow') : t('l7b.updatedAgo', { n: Math.max(0, Math.round((now - sampling.lastOkAt) / 1000)) })) : t('l7b.justNow')}`
                : t('l7b.autoOffHint')}
            </span>
          </header>
          {ranked.shown.length === 0 ? (
            <p className="l7-muted">{t('l7.scopeEmpty')}</p>
          ) : (
            <div className="l7-cards">
              {ranked.shown.map((h) => {
                const sessionSnap = h.sessionId ? snaps[h.sessionId] : undefined
                const probeSnap = sampling.snaps[h.profileId]
                const protBadge = h.protection === 'production' || h.protection === 'readonly' ? h.protection : null
                const showDemoBadge = Boolean(h.demo) && protBadge == null
                const failReason = probePrefs.enabled && probeSnap?.phase === 'fail' ? probeSnap.error : sessionSnap?.error
                const cardTitle = [h.via ? `${h.demo && protBadge ? `${h.title} · ${t('l7.demoHost')}` : h.title} · ${t('m2.via', { chain: h.via })}` : h.demo && protBadge ? `${h.title} · ${t('l7.demoHost')}` : h.title, failReason].filter(Boolean).join(' — ')
                const latency = h.latencyMs
                return (
                  <article
                    key={h.profileId}
                    className={`l7-card${h.alerting ? ' is-alert' : ''}${failReason ? ' is-err' : ''}`}
                    data-testid="l7-card"
                    title={cardTitle}
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
                      <span className="l7-card-name" data-testid="l7-card-title">{h.title}</span>
                      {protBadge ? (
                        <span className={`prot-badge prot-badge--${protBadge}`}>{t(protBadge === 'production' ? 'l4.production' : 'l4.readonly')}</span>
                      ) : showDemoBadge ? (
                        <span className="demo-badge">{t('l7.demo')}</span>
                      ) : null}
                    </div>
                    <div className="l7-card-lat">{latency != null ? `${latency} ms` : h.online ? '—' : t('l7.offline')}</div>
                    <CardMetrics
                      enabled={probePrefs.enabled}
                      sessionSnap={sessionSnap}
                      probeSnap={probeSnap}
                      hasSession={Boolean(h.sessionId)}
                      memLabel={t('l7.mem')}
                      diskLabel={t('l7.disk')}
                      offHint={t('l7b.autoOffHint')}
                      enableLabel={t('l7b.enable')}
                      probing={t('l7b.probing')}
                      probingShort={t('l7b.probingShort')}
                      queued={t('l7b.queued')}
                      fail={t('l7b.fail')}
                      retry={t('l7b.retry')}
                      unreachable={t('l7.unreachable')}
                      ago={probeSnap?.at ? t('l7b.updatedAgo', { n: Math.max(0, Math.round((now - probeSnap.at) / 1000)) }) : ''}
                      onEnable={(e) => {
                        e.stopPropagation()
                        onProbePrefs({ enabled: true })
                      }}
                      onRetry={(e) => {
                        e.stopPropagation()
                        if (probePrefs.enabled) sampling.retry(h.profileId)
                        else if (h.sessionId) {
                          setSnaps((prev) => ({
                            ...prev,
                            [h.sessionId!]: { ...(prev[h.sessionId!] ?? sessionSnap), cpu: sessionSnap?.cpu ?? null, mem: sessionSnap?.mem ?? null, disk: sessionSnap?.disk ?? null, error: null, loading: true }
                          }))
                          void loadSnaps([h.sessionId])
                        } else onConnect(h)
                      }}
                    />
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
          <button type="button" data-testid="l7-open-sftp" onClick={() => onOpenSftp?.()}>
            {t('l7.shortcut.sftp')}
          </button>
          <button type="button" data-testid="l7-sync-folder" onClick={() => onSyncFolder?.()}>
            {t('l7.shortcut.syncFolder')}
          </button>
          <button type="button" onClick={onImport}>
            {t('l7.import')}
          </button>
          <button type="button" onClick={onCheckUpdate}>
            {t('menu.checkUpdate')}
          </button>
          <div className="l7-rail-split" />
          <strong>{t('l7.recentPlaybooks')}</strong>
          {(recentPlaybooks ?? [
            { id: 'sample-disk', name: t('l7.sampleDisk') },
            { id: 'sample-nginx', name: t('l7.sampleRestart') }
          ]).map((p) => (
            <button type="button" key={p.id} onClick={() => (onOpenRecent ? onOpenRecent(p.id) : onPlaybook())}>
              {p.name}
            </button>
          ))}
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
  const known = value != null
  const p = known ? Math.max(0, Math.min(100, value)) : 0
  const tone = p >= 85 ? 'bad' : p >= 70 ? 'warn' : 'ok'
  return (
    <div className="l7-metric">
      <span>{label}</span>
      <span className="l7-bar">{known ? <span className={`l7-fill l7-${tone}`} style={{ width: `${p}%` }} /> : null}</span>
      <span>{known ? `${Math.round(value)}%` : '—'}</span>
    </div>
  )
}

function CardMetrics({
  enabled,
  sessionSnap,
  probeSnap,
  hasSession,
  memLabel,
  diskLabel,
  offHint,
  enableLabel,
  probing,
  probingShort,
  queued,
  fail,
  retry,
  unreachable,
  ago,
  onEnable,
  onRetry
}: {
  enabled: boolean
  sessionSnap?: { cpu: number | null; mem: number | null; disk: number | null; error: string | null }
  probeSnap?: { phase: string; cpu: number | null; mem: number | null; disk: number | null; error: string | null }
  hasSession: boolean
  memLabel: string
  diskLabel: string
  offHint: string
  enableLabel: string
  probing: string
  probingShort: string
  queued: string
  fail: string
  retry: string
  unreachable: string
  ago: string
  onEnable: (e: MouseEvent) => void
  onRetry: (e: MouseEvent) => void
}) {
  if (!enabled) {
    if (!hasSession) {
      return (
        <div className="l7b-status l7b-off">
          <span>{offHint}</span>
          <button type="button" onClick={onEnable}>
            {enableLabel}
          </button>
        </div>
      )
    }
    if (sessionSnap?.error) {
      return (
        <div className="l7-card-err">
          <span>{unreachable}</span>
          <button type="button" onClick={onRetry}>
            {retry}
          </button>
        </div>
      )
    }
    return (
      <div className="l7-metrics">
        <Metric label="CPU" value={sessionSnap?.cpu ?? null} />
        <Metric label={memLabel} value={sessionSnap?.mem ?? null} />
        <Metric label={diskLabel} value={sessionSnap?.disk ?? null} />
      </div>
    )
  }
  if (probeSnap?.phase === 'fail') {
    return (
      <div className="l7-card-err" title={probeSnap.error ?? fail}>
        <span>{fail}</span>
        <button type="button" data-testid="l7b-retry" onClick={onRetry}>
          {retry}
        </button>
      </div>
    )
  }
  if (probeSnap?.phase === 'ok') {
    return (
      <div className="l7-metrics">
        <Metric label="CPU" value={probeSnap.cpu} />
        <Metric label={memLabel} value={probeSnap.mem} />
        <Metric label={diskLabel} value={probeSnap.disk} />
        {ago ? <span className="l7b-ago">{ago}</span> : null}
      </div>
    )
  }
  if (probeSnap?.phase === 'queued') {
    return <div className="l7b-status">{queued}</div>
  }
  return (
    <div className="l7b-status" data-testid="l7b-probing">
      <span className="l7b-skel" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span className="l7b-long">{probing}</span>
      <span className="l7b-short">{probingShort}</span>
    </div>
  )
}
