import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { FiredAlert } from '@shared/alert-rules'
import type { DashScope } from '@shared/dashboard-scope'
import { pickHealthHosts } from '@shared/dashboard-scope'
import { opsHomeQuietLayout } from '@shared/ops-home-density'
import { probeFiltersActive, selectProbeTargets, type HealthProbeResult, type ProbePrefs } from '@shared/health-probe'
import { loadMaintenance, silenceUntil } from '@shared/maintenance'
import type { ProtectionLevel } from '@shared/protection'
import { useI18n, type MessageKey } from '../lib/i18n'
import { useHealthSampling, type SampleHost } from '../lib/health-sampling'
import { healthMenuItems, type MenuEntry } from '@shared/inline-menus'
import { planAlertFix } from '../lib/alert-fix'
import { showToast } from '../lib/toast'
import { AlertLine } from './AlertLine'
import { BuiltMenu } from './BuiltMenu'
import EmptyState from './EmptyState'
import Button from './ui/Button'
import PanelHeader from './ui/PanelHeader'
import Icon from './Icon'
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
  tags?: string[]
}

type Snap = { cpu: number | null; mem: number | null; disk: number | null; error: string | null; loading: boolean }

type MenuState = { x: number; y: number; profileId: string; entry: MenuEntry } | null

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
  aiConfigured,
  onCreateFix,
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
  retryAllNonce,
  onFailCount,
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
  aiConfigured?: boolean
  onCreateFix?: (alert: FiredAlert, fixes: Array<{ command: string; note?: string }>) => void
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
  retryAllNonce?: number
  onFailCount?: (n: number) => void
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
        tags: h.tags,
        protection: h.protection,
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
  const rootRef = useRef<HTMLDivElement>(null)
  const [opsWidth, setOpsWidth] = useState(1400)
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      setOpsWidth(typeof window === 'undefined' ? 1400 : window.innerWidth)
      return
    }
    const measure = () => setOpsWidth(el.clientWidth || window.innerWidth)
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])
  // Density from panel width only — same structure maximized or windowed.
  const quietLayout = opsHomeQuietLayout(opsWidth)
  const ranked = useMemo(
    () => pickHealthHosts(cardSource, (h) => h.alerting, quietLayout.cardCap),
    [cardSource, quietLayout.cardCap]
  )
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
  const tagOptions = useMemo(() => [...new Set(hosts.flatMap((h) => h.tags ?? []))].sort(), [hosts])
  const unfilteredCount = useMemo(() => {
    if (!probePrefs.enabled) return hosts.length
    return selectProbeTargets(
      sampleHosts,
      { ...probePrefs, filterTags: false, tags: [], prodOnly: false, excludeReadonly: false },
      { grouped: probeGrouped }
    ).length
  }, [probePrefs, sampleHosts, probeGrouped, hosts.length])
  const sampling = useHealthSampling({
    enabled: probePrefs.enabled,
    hosts: visibleSamples,
    maxConcurrent: probePrefs.maxConcurrent,
    active: probeActive,
    nonce: probeNonce + retryNonce,
    backoffCapMin: probePrefs.backoffCapMin,
    retryAllNonce,
    onSample,
    onSweep,
    onRelease
  })
  const failCount = Object.values(sampling.snaps).filter((s) => s.phase === 'fail').length
  useEffect(() => {
    onFailCount?.(failCount)
  }, [failCount, onFailCount])
  const filterSummary = [
    probePrefs.filterTags && probePrefs.tags.length ? t('l7c.summaryTags', { tags: probePrefs.tags.join(',') }) : '',
    probePrefs.prodOnly ? t('l7c.summaryProd') : probePrefs.excludeReadonly ? t('l7c.summaryRo') : ''
  ].filter(Boolean).join(' · ')
  const showFiltered = probePrefs.enabled && probeFiltersActive(probePrefs) && probeTargets.length !== unfilteredCount
  const filterEmpty = probePrefs.enabled && hosts.length > 0 && unfilteredCount > 0 && probeTargets.length === 0
  const cooling = now < sampling.coolUntil
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
    const id = window.setInterval(() => setNow(Date.now()), failCount ? 1000 : 30000)
    return () => window.clearInterval(id)
  }, [failCount])

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
      <div ref={rootRef} className="workspace-panel l7-root" data-testid="ops-home" data-ops-quiet={quietLayout.foldSecondary ? '1' : '0'} data-ops-card-cap={quietLayout.cardCap}>
        <PanelHeader className="l7-head" title={t('l7.title')} />
        <div className="workspace-panel-body">
          <EmptyState
            testId="l7-empty"
            icon="host"
            title={t('ux08.sidebarTitle')}
            desc={t('pf4.hostsDesc')}
            primary={{ label: t('pf1.new'), onClick: onNewConnection, testId: 'l7-new-connection', command: 'connection' }}
            secondary={[
              { label: t('pf1.import'), onClick: onImport, command: 'importSessions' },
              { label: t('pf4.tryDemo'), onClick: onDemo, testId: 'l7-try-demo', command: 'demoHost' }
            ]}
          />
        </div>
      </div>
    )
  }

  const muted = mutedUntil != null && mutedUntil > now
  const primaryIsAlerts = activeCount > 0

  return (
    <div ref={rootRef} className="workspace-panel l7-root" data-testid="ops-home" data-ops-quiet={quietLayout.foldSecondary ? '1' : '0'} data-ops-card-cap={quietLayout.cardCap}>
      <PanelHeader
        className="l7-head"
        title={t('l7.title')}
        meta={
          <>
            {t('l7.meta', { n: hosts.length, a: activeCount })}
            {showFiltered ? <span data-testid="l7c-filtered"> · {t('l7c.filteredCount', { n: probeTargets.length })}</span> : null}
          </>
        }
        actionsClassName="l7-head-actions"
        actions={
          <>
          {primaryIsAlerts ? (
            <Button variant="primary" data-testid="l7-primary" onClick={() => onOpenWorkbench()}>
              {t('l7.workAlerts')}
            </Button>
          ) : (
            <Button variant="primary" data-testid="l7-primary" onClick={onNewConnection}>
              {t('l7.newConnection')}
            </Button>
          )}
          <Button
            variant="icon"
            aria-label={t('l7.more')}
            aria-expanded={more}
            onClick={(e) => {
              e.stopPropagation()
              setMore((v) => !v)
            }}
          >
            ⋯
          </Button>
          {more ? (
            <div className="l7-more" role="menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" data-testid="l7-open-dashboard" onClick={() => { setMore(false); onOpenDashboard() }}>
                {t('l7.openDashboard')}
              </button>
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
              <HealthProbeFields prefs={probePrefs} tagOptions={tagOptions} onChange={onProbePrefs} />
            </div>
          ) : null}
          </>
        }
      />
      <div className="l7-body">
        <section className="l7-col l7-health" aria-label={t('l7.health')}>
          <header className="l7-col-head">
            <strong>{t('l7.health')}</strong>
            <ScopePicker scope={scope} folders={folders} hosts={hosts.map((h) => ({ id: h.profileId, title: h.title }))} onChange={onScope} />
            <button
              type="button"
              className="l7-icon-btn"
              data-testid="l7-health-refresh"
              title={t('l7.refresh')}
              aria-label={t('l7.refresh')}
              onClick={() => setRetryNonce((n) => n + 1)}
            >
              <Icon name="refresh-cw" size={16} strokeWidth={1.5} />
            </button>
            {failCount > 0 ? (
              <button
                type="button"
                data-testid="l7c-retry-all"
                disabled={cooling}
                title={cooling ? t('l7c.retryCool') : t('l7c.retryAll')}
                onClick={() => sampling.retryAll()}
              >
                {cooling ? t('l7c.retryCool') : t('l7c.retryAll')}
              </button>
            ) : null}
            {filterSummary ? <span className="l7c-summary" title={filterSummary}>{filterSummary}</span> : null}
            <span className="l7b-head-status">
              {probePrefs.enabled
                ? `${t('l7b.autoOn')} · ${sampling.lastOkAt ? (now - sampling.lastOkAt < 5000 ? t('l7b.justNow') : t('l7b.updatedAgo', { n: Math.max(0, Math.round((now - sampling.lastOkAt) / 1000)) })) : t('l7b.justNow')}`
                : t('l7b.autoOffHint')}
            </span>
          </header>
          {filterEmpty ? (
            <div data-testid="l7c-empty-filter">
              <p className="l7-muted">{t('l7c.emptyFilter')}</p>
              <button type="button" onClick={() => onProbePrefs({ filterTags: false, tags: [], prodOnly: false, excludeReadonly: false })}>
                {t('l7c.clearFilter')}
              </button>
              <button type="button" onClick={() => setProbeOpen(true)}>{t('l7b.settings')}</button>
            </div>
          ) : ranked.shown.length === 0 ? (
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
                    data-overflow="none"
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, profileId: h.profileId, entry: 'context' })
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
                      failRetry={t('l7c.failRetry')}
                      retryHint={probeSnap?.retryAt ? t('l7c.retryIn', { time: retryLabel(probeSnap.retryAt, now) }) : ''}
                      retry={t('l7b.retry')}
                      unreachable={t('l7.unreachable')}
                      ago={probeSnap?.at ? t('l7b.updatedAgo', { n: Math.max(0, Math.round((now - probeSnap.at) / 1000)) }) : ''}
                      extraLoad={probePrefs.extraLoad}
                      extraInode={probePrefs.extraInode}
                      extraMounts={probePrefs.extraMounts}
                      missingMount={t('l7d.missingMount')}
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
                    {h.alerting ? (
                      <span
                        className="l7-alert-dot"
                        data-flash={silenceUntil(loadMaintenance(), { keys: [h.profileId, h.title, h.host], tags: h.tags }, now) ? '0' : '1'}
                        title={t('o2.badge')}
                      />
                    ) : null}
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
              icon="alert"
              title={t('pf4.alertTitle')}
              desc={t('pf4.alertDesc')}
              primary={{ label: t('pf4.alertRules'), onClick: onRules }}
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
                    explainDisabled={aiConfigured === false}
                    explainTitle={aiConfigured === false ? t('w1.needAi') : t('a4.interpret')}
                    onFixPlaybook={() => {
                      const plan = planAlertFix(a.id, aiConfigured !== false)
                      if (plan.action === 'need-ai') return
                      if (plan.action === 'draft') onCreateFix?.(a, plan.fixes)
                      else if (plan.action === 'explain') onExplain(a)
                      else showToast(t('w1.noFix'))
                    }}
                    fixDisabled={aiConfigured === false}
                    fixTitle={aiConfigured === false ? t('w1.needAi') : t('w1.create')}
                    maintenanceUntil={silenceUntil(loadMaintenance(), { keys: [a.hostKey, a.hostTitle], tags: [] }, now)}
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
        <BuiltMenu
          variant="host"
          testId="health-card-menu"
          nodes={healthMenuItems(menu.entry)}
          anchorX={menu.x}
          anchorY={menu.y}
          t={(key, vars) => t(key as MessageKey, vars)}
          onPick={(id) => {
            const host = hosts.find((h) => h.profileId === menu.profileId)
            const profileId = menu.profileId
            setMenu(null)
            if (id === 'monitor') {
              if (host) onOpenMonitor(host)
            } else if (id === 'connect') {
              if (host) onConnect(host)
            } else if (id === 'workbench') {
              const hit = alerts.find((a) => a.status === 'active' && host?.sessionId && a.hostKey === host.sessionId)
              onOpenWorkbench(hit?.id)
            } else if (id === 'guard') onGuard(profileId)
          }}
        />
      ) : null}
    </div>
  )
}

function retryLabel(retryAt: number, now: number): string {
  const left = Math.max(0, retryAt - now)
  if (left < 60_000) return `${Math.max(1, Math.ceil(left / 1000))}s`
  return `${Math.max(1, Math.ceil(left / 60_000))}m`
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
  failRetry,
  retryHint,
  retry,
  unreachable,
  ago,
  extraLoad,
  extraInode,
  extraMounts,
  missingMount,
  onEnable,
  onRetry
}: {
  enabled: boolean
  sessionSnap?: { cpu: number | null; mem: number | null; disk: number | null; error: string | null }
  probeSnap?: {
    phase: string
    cpu: number | null
    mem: number | null
    disk: number | null
    error: string | null
    load?: [number, number, number] | null
    inode?: number | null
    mounts?: Array<{ path: string; percent: number | null; missing?: boolean }>
  }
  hasSession: boolean
  memLabel: string
  diskLabel: string
  offHint: string
  enableLabel: string
  probing: string
  probingShort: string
  queued: string
  fail: string
  failRetry?: string
  retryHint?: string
  retry: string
  unreachable: string
  ago: string
  extraLoad?: boolean
  extraInode?: boolean
  extraMounts?: boolean
  missingMount?: string
  onEnable: (e: MouseEvent) => void
  onRetry: (e: MouseEvent) => void
}) {
  const waiting = Boolean(enabled && probeSnap && probeSnap.phase !== 'ok' && probeSnap.phase !== 'fail' && probeSnap.phase !== 'queued')
  const [skelOn, setSkelOn] = useState(false)
  useEffect(() => {
    if (!waiting) {
      setSkelOn(false)
      return
    }
    const id = window.setTimeout(() => setSkelOn(true), 300)
    return () => window.clearTimeout(id)
  }, [waiting, probeSnap?.phase])
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
      <div className="l7-card-err l7c-fail" title={probeSnap.error ?? fail} data-testid="l7c-fail">
        <span className="l7c-fail-line">{failRetry || fail}</span>
        {retryHint ? <span className="l7c-fail-sub">{retryHint}</span> : null}
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
        {extraLoad && probeSnap.load ? (
          <div className="l7d-line" data-testid="l7d-load-line">{`LOAD ${probeSnap.load.map((n) => n.toFixed(2)).join(' ')}`}</div>
        ) : null}
        {extraInode && probeSnap.inode != null ? (
          <div className={`l7d-line${probeSnap.inode >= 90 ? ' is-warn' : ''}`} data-testid="l7d-inode-line">{`INO ${Math.round(probeSnap.inode)}%`}</div>
        ) : null}
        {extraMounts
          ? (probeSnap.mounts ?? []).map((m) => (
              <div key={m.path} className="l7d-line" data-testid="l7d-mount-line" title={m.missing ? missingMount : undefined}>
                {m.missing ? `${m.path} —` : `${m.path} ${Math.round(m.percent ?? 0)}%`}
              </div>
            ))
          : null}
        {ago ? <span className="l7b-ago">{ago}</span> : null}
      </div>
    )
  }
  if (probeSnap?.phase === 'queued') {
    return <div className="l7b-status">{queued}</div>
  }
  return (
    <div className="l7b-status" data-testid="l7b-probing">
      {skelOn ? (
        <span className="l7b-skel" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : null}
      <span className="l7b-long">{probing}</span>
      <span className="l7b-short">{probingShort}</span>
    </div>
  )
}
