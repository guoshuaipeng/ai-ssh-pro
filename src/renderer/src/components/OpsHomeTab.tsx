import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import type { FiredAlert } from '@shared/alert-rules'
import { ageBucket } from '@shared/alert-workbench'
import type { DashScope } from '@shared/dashboard-scope'
import { pickHealthHosts } from '@shared/dashboard-scope'
import { OPS_HOME_ATTENTION_CAP, OPS_HOME_CARD_CAP } from '@shared/ops-home-density'
import { probeFiltersActive, selectProbeTargets, type HealthProbeResult, type ProbePrefs } from '@shared/health-probe'
import { loadMaintenance, silenceUntil } from '@shared/maintenance'
import { loadMetricCache, pickMetrics, staleAge, staleHintKey, writeCachedMetrics, type MetricView } from '@shared/metric-cache'
import type { ProtectionLevel } from '@shared/protection'
import type { TaskId } from '@shared/retention-tasks'
import { useI18n, type MessageKey } from '../lib/i18n'
import { useHealthSampling, type SampleHost } from '../lib/health-sampling'
import { healthMenuItems, type MenuEntry } from '@shared/inline-menus'
import { planAlertFix } from '../lib/alert-fix'
import { showToast } from '../lib/toast'
import { toastUndo } from '../lib/dialogs'
import { alertTone } from './AlertLine'
import { BuiltMenu } from './BuiltMenu'
import { openContextMenu, type ContextMenuItem } from './ContextMenu'
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

/** Session resource read. No `loading` flag: metrics never show a loading state (M17). */
type Snap = { cpu: number | null; mem: number | null; disk: number | null; error: string | null; at: number }

type MenuState = { x: number; y: number; profileId: string; entry: MenuEntry } | null

type Severity = 'crit' | 'warn' | 'info'

/** One row of 需要处理: an alert, or a host we could not reach. */
type AttnItem =
  | { kind: 'alert'; id: string; sev: Severity; at: number; alert: FiredAlert }
  | { kind: 'host'; id: string; sev: Severity; at: number; host: HomeHost; reason: string; retryHint: string; ignored: boolean }

const SEV_RANK: Record<Severity, number> = { crit: 0, warn: 1, info: 2 }

const AGE_KEY: Record<'just' | 'min' | 'hour' | 'day', MessageKey> = {
  just: 'l2.justNow',
  min: 'l2.agoMin',
  hour: 'l2.agoHour',
  day: 'l2.agoDay'
}

const RULE_KEY: Record<FiredAlert['ruleId'], MessageKey> = {
  cpu: 'l7e.rule.cpu',
  mem: 'l7e.rule.mem',
  disk: 'l7e.rule.disk',
  offline: 'l7e.rule.offline'
}

const TASK_KEY: Record<TaskId, MessageKey> = {
  connect: 'g3.connect',
  monitor: 'g3.monitor',
  ai: 'g3.ai',
  transfer: 'g3.transfer'
}

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
  nextTask,
  onScope,
  onNewConnection,
  onOpenDashboard,
  onOpenWorkbench,
  onOpenMonitor,
  onConnect,
  onEditHost,
  onOpenHostSftp,
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
  onDismissTasks,
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
  nextTask?: TaskId
  onScope: (s: DashScope) => void
  onNewConnection: () => void
  onOpenDashboard: () => void
  onOpenWorkbench: (alertId?: string) => void
  onOpenMonitor: (host: HomeHost) => void
  onConnect: (host: HomeHost) => void
  onEditHost?: (profileId: string) => void
  onOpenHostSftp?: (host: HomeHost) => void
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
  onDismissTasks?: () => void
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
  const [now, setNow] = useState(() => Date.now())
  const [retryNonce, setRetryNonce] = useState(0)
  const [probeOpen, setProbeOpen] = useState(false)
  const [ignoredHosts, setIgnoredHosts] = useState<Set<string>>(() => new Set())
  const [attnFocus, setAttnFocus] = useState(0)
  const [tileFocus, setTileFocus] = useState(0)
  const rowsRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
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
    if (!probePrefs.enabled) return probePrefs.excludeReadonly ? hosts.filter((h) => h.protection !== 'readonly') : hosts
    const ids = new Set(probeTargets.map((t) => t.profileId))
    return hosts.filter((h) => ids.has(h.profileId))
  }, [hosts, probePrefs.enabled, probePrefs.excludeReadonly, probeTargets])
  // One structure at every width: tiles cap at OPS_HOME_CARD_CAP, the grid only changes its column count.
  const ranked = useMemo(() => pickHealthHosts(cardSource, (h) => h.alerting, OPS_HOME_CARD_CAP), [cardSource])
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
    // 排除只读 has its own toggle in the section head; only prod-only needs a summary chip.
    probePrefs.prodOnly ? t('l7c.summaryProd') : ''
  ].filter(Boolean).join(' · ')
  const showFiltered = probePrefs.enabled && probeFiltersActive(probePrefs) && probeTargets.length !== unfilteredCount
  const filterEmpty = probePrefs.enabled && hosts.length > 0 && unfilteredCount > 0 && probeTargets.length === 0
  const cooling = now < sampling.coolUntil

  // Last-known metrics: read once per host list / sample wave; live data overrides silently.
  const [cacheTick, setCacheTick] = useState(0)
  const metricCache = useMemo(() => loadMetricCache(), [hosts, cacheTick])
  useEffect(() => {
    let wrote = false
    for (const h of ranked.shown) {
      const p = sampling.snaps[h.profileId]
      if (p?.phase === 'ok' && writeCachedMetrics(h.profileId, { cpu: p.cpu, mem: p.mem, disk: p.disk, load: p.load ?? null, at: p.at })) wrote = true
      const s = h.sessionId ? snaps[h.sessionId] : undefined
      if (s && !s.error && writeCachedMetrics(h.profileId, { cpu: s.cpu, mem: s.mem, disk: s.disk, at: s.at })) wrote = true
    }
    if (wrote) setCacheTick((n) => n + 1)
  }, [sampling.snaps, snaps, ranked.shown])

  const loadSnaps = useCallback(async (ids: string[]) => {
    await Promise.all(
      ids.map(async (sessionId) => {
        try {
          const r = await window.aiss.workspace.resources(sessionId)
          const disk = r.disks?.length ? Math.max(...r.disks.map((d) => d.percent)) : null
          setSnaps((prev) => ({
            ...prev,
            [sessionId]: { cpu: r.cpuPercent ?? null, mem: r.mem?.percent ?? null, disk, error: null, at: Date.now() }
          }))
        } catch (e) {
          setSnaps((prev) => ({
            ...prev,
            [sessionId]: {
              cpu: prev[sessionId]?.cpu ?? null,
              mem: prev[sessionId]?.mem ?? null,
              disk: prev[sessionId]?.disk ?? null,
              error: e instanceof Error ? e.message : String(e),
              at: prev[sessionId]?.at ?? 0
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

  const refresh = useCallback(() => setRetryNonce((n) => n + 1), [])
  // F5 refreshes while the home tab is the visible one (Ctrl+Shift+N stays the global keymap entry).
  useEffect(() => {
    if (!probeActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F5' || e.ctrlKey || e.altKey || e.metaKey) return
      e.preventDefault()
      refresh()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [probeActive, refresh])

  const ago = (at: number) => {
    const age = ageBucket(at, now)
    return t(AGE_KEY[age.key], { n: age.n })
  }
  const staleHint = (at: number) => {
    const age = staleAge(at, now)
    return t(staleHintKey(age), { n: age.n })
  }

  // 需要处理: alerts + unreachable hosts in ONE list, severity first, then newest.
  const attention = useMemo<AttnItem[]>(() => {
    const items: AttnItem[] = []
    for (const a of alerts) {
      const keep = inboxFilter === 'all' ? true : a.status === (inboxFilter === 'ignored' ? 'ignored' : 'active')
      if (keep) items.push({ kind: 'alert', id: `a:${a.id}`, sev: alertTone(a.ruleId), at: a.at, alert: a })
    }
    const offlineAlerted = new Set(alerts.filter((a) => a.status === 'active' && a.ruleId === 'offline').map((a) => a.hostTitle))
    for (const h of ranked.shown) {
      const probeSnap = sampling.snaps[h.profileId]
      const sessionSnap = h.sessionId ? snaps[h.sessionId] : undefined
      const failed = probePrefs.enabled && probeSnap?.phase === 'fail'
      const reason = failed ? probeSnap?.error ?? t('l7b.fail') : sessionSnap?.error ?? null
      if (!reason || offlineAlerted.has(h.title)) continue
      const ignored = ignoredHosts.has(h.profileId)
      if (inboxFilter === 'ignored' ? !ignored : ignored) continue
      const retryHint = failed && probeSnap?.retryAt ? t('l7c.retryIn', { time: retryLabel(probeSnap.retryAt, now) }) : ''
      items.push({ kind: 'host', id: `h:${h.profileId}`, sev: 'crit', at: probeSnap?.at ?? sessionSnap?.at ?? 0, host: h, reason, retryHint, ignored })
    }
    return items.sort((x, y) => SEV_RANK[x.sev] - SEV_RANK[y.sev] || y.at - x.at)
  }, [alerts, inboxFilter, ranked.shown, sampling.snaps, snaps, probePrefs.enabled, ignoredHosts, now, t])
  const shownAttn = attention.slice(0, OPS_HOME_ATTENTION_CAP)
  const pendingCount = activeCount + attention.filter((x) => x.kind === 'host' && !x.ignored).length
  const onlineCount = hosts.filter((h) => h.online).length

  const onFixPlaybook = (a: FiredAlert) => {
    const plan = planAlertFix(a.id, aiConfigured !== false)
    if (plan.action === 'need-ai') return
    if (plan.action === 'draft') onCreateFix?.(a, plan.fixes)
    else if (plan.action === 'explain') onExplain(a)
    else showToast(t('w1.noFix'))
  }
  const retryHost = (h: HomeHost) => {
    if (probePrefs.enabled) sampling.retry(h.profileId)
    else if (h.sessionId) void loadSnaps([h.sessionId])
    else onConnect(h)
  }
  const ignoreHost = (h: HomeHost) => {
    setIgnoredHosts((prev) => new Set(prev).add(h.profileId))
    toastUndo({
      message: t('l7e.hostIgnored', { host: h.title }),
      undo: () =>
        setIgnoredHosts((prev) => {
          const next = new Set(prev)
          next.delete(h.profileId)
          return next
        })
    })
  }
  const primaryAction = (item: AttnItem) => {
    if (item.kind === 'host') retryHost(item.host)
    else if (aiConfigured === false) onLocate(item.alert)
    else onExplain(item.alert)
  }
  const ignoreItem = (item: AttnItem) => {
    if (item.kind === 'host') {
      if (!item.ignored) ignoreHost(item.host)
    } else if (item.alert.status === 'active') onDismiss(item.alert)
  }
  const rowMenu = (item: AttnItem, at: { clientX: number; clientY: number }) => {
    const items: ContextMenuItem[] =
      item.kind === 'alert'
        ? [
            {
              id: 'fix',
              label: t('w1.create'),
              disabled: aiConfigured === false,
              title: aiConfigured === false ? t('w1.needAi') : undefined,
              onSelect: () => onFixPlaybook(item.alert)
            },
            { id: 'locate', label: t('o4.locate'), onSelect: () => onLocate(item.alert) },
            { id: 'workbench', label: t('l7.viewInWorkbench'), onSelect: () => onOpenWorkbench(item.alert.id) }
          ]
        : [
            { id: 'connect', label: t('l7.connect'), onSelect: () => onConnect(item.host) },
            { id: 'monitor', label: t('l7e.monitor'), onSelect: () => onOpenMonitor(item.host) },
            { id: 'guard', label: t('l4.menu'), onSelect: () => onGuard(item.host.profileId) }
          ]
    openContextMenu(at, items)
  }
  const focusRow = (i: number) => {
    const rows = rowsRef.current?.querySelectorAll<HTMLElement>('[data-oh-row]')
    if (!rows?.length) return
    const k = Math.max(0, Math.min(rows.length - 1, i))
    setAttnFocus(k)
    rows[k].focus()
  }
  const onRowKey = (e: ReactKeyboardEvent<HTMLDivElement>, i: number, item: AttnItem) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ArrowDown') focusRow(i + 1)
    else if (e.key === 'ArrowUp') focusRow(i - 1)
    else if (e.key === 'Home') focusRow(0)
    else if (e.key === 'End') focusRow(shownAttn.length - 1)
    else if (e.key === 'Enter') primaryAction(item)
    else if (e.key === 'Delete') ignoreItem(item)
    else if (e.key === '.' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      const r = e.currentTarget.getBoundingClientRect()
      rowMenu(item, { clientX: r.right - 8, clientY: r.bottom })
    } else return
    e.preventDefault()
  }
  const focusTile = (i: number) => {
    const tiles = gridRef.current?.querySelectorAll<HTMLElement>('[data-oh-tile]')
    if (!tiles?.length) return
    const k = Math.max(0, Math.min(tiles.length - 1, i))
    setTileFocus(k)
    tiles[k].focus()
  }
  const gridCols = () => {
    const tiles = gridRef.current?.querySelectorAll<HTMLElement>('[data-oh-tile]')
    if (!tiles?.length) return 1
    const top = tiles[0].offsetTop
    let n = 0
    for (const el of tiles) if (el.offsetTop === top) n++
    return Math.max(1, n)
  }
  const onTileKey = (e: ReactKeyboardEvent<HTMLElement>, i: number, h: HomeHost) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'ArrowRight') focusTile(i + 1)
    else if (e.key === 'ArrowLeft') focusTile(i - 1)
    else if (e.key === 'ArrowDown') focusTile(i + gridCols())
    else if (e.key === 'ArrowUp') focusTile(i - gridCols())
    else if (e.key === 'Enter') onConnect(h)
    else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      const r = e.currentTarget.getBoundingClientRect()
      setMenu({ x: r.left + 16, y: r.top + 32, profileId: h.profileId, entry: 'context' })
    } else return
    e.preventDefault()
  }

  const empty = hosts.length === 0 && scope.mode === 'all'
  const muted = mutedUntil != null && mutedUntil > now

  const statusLine = empty ? null : (
    <span className="oh-status">
      <span className="oh-stat"><i className="oh-dot oh-dot--ok" aria-hidden />{t('l7e.online', { n: onlineCount })}</span>
      {failCount > 0 ? (
        <span className="oh-stat"><i className="oh-dot oh-dot--crit" aria-hidden />{t('l7e.unreachableN', { n: failCount })}</span>
      ) : null}
      <span className="oh-stat">{t('l7e.pending', { n: pendingCount })}</span>
      <span className="oh-stat">
        {probePrefs.enabled
          ? t('l7e.updated', { time: sampling.lastOkAt ? (now - sampling.lastOkAt < 5000 ? t('l7b.justNow') : ago(sampling.lastOkAt)) : t('l7b.justNow') })
          : t('l7b.autoOffHint')}
      </span>
    </span>
  )

  const header = (
    <PanelHeader
      className="l7-head oh-head"
      title={t('l7.title')}
      meta={statusLine}
      actionsClassName="l7-head-actions"
      actions={
        <>
          {!empty ? (
            <button
              type="button"
              className="l7-icon-btn"
              data-testid="l7-health-refresh"
              title={`${t('l7.refresh')} (F5)`}
              aria-label={t('l7.refresh')}
              onClick={refresh}
            >
              <Icon name="refresh-cw" size={16} strokeWidth={1.5} />
            </button>
          ) : null}
          <Button
            variant="icon"
            aria-label={t('l7.more')}
            title={t('l7.more')}
            aria-haspopup="menu"
            aria-expanded={more}
            onClick={(e) => {
              e.stopPropagation()
              setMore((v) => !v)
            }}
          >
            ⋯
          </Button>
          {!empty ? (
            <Button variant="primary" data-testid="l7-primary" title="Ctrl+Shift+N" onClick={onNewConnection}>
              <Icon name="plus" size={14} strokeWidth={2} />
              {t('l7.newConnection')}
            </Button>
          ) : null}
          {more ? (
            <div className="l7-more" role="menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" role="menuitem" data-testid="l7-open-dashboard" onClick={() => { setMore(false); onOpenDashboard() }}>
                {t('l7.openDashboard')}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMore(false); onRules() }}>
                {t('menu.alertRules')}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMore(false); onPlaybook() }}>
                {t('l7.playbooks')}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMore(false); onInspect() }}>
                {t('a3.short')}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMore(false); onStartup() }}>
                {t('menu.startupSettings')}
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="l7b-open-settings"
                onClick={() => {
                  setMore(false)
                  setProbeOpen(true)
                }}
              >
                {t('l7b.settings')}
              </button>
              <hr className="oh-menu-sep" />
              <button type="button" role="menuitem" onClick={() => { setMore(false); onImport() }}>
                {t('l7.import')}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMore(false); onCheckUpdate() }}>
                {t('menu.checkUpdate')}
              </button>
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
  )

  const samples = recentPlaybooks?.length
    ? recentPlaybooks.slice(0, 3)
    : [
        { id: 'sample-nginx', name: t('l7.sampleRestart') },
        { id: 'sample-disk', name: t('l7.sampleDisk') }
      ]
  const quick = (
    <Section title={t('l7e.quick')} link={<button type="button" className="oh-link" onClick={onPlaybook}>{t('l7e.allPlaybooks')}</button>}>
      <div className="oh-quick">
        <Button variant="secondary" onClick={onPlaybook}>
          <Icon name="play" size={14} strokeWidth={1.75} />
          {t('l7.runPlaybook')}
        </Button>
        <Button variant="secondary" data-testid="l7-open-sftp" onClick={() => onOpenSftp?.()}>
          {t('l7.shortcut.sftp')}
        </Button>
        <Button variant="secondary" data-testid="l7-sync-folder" onClick={() => onSyncFolder?.()}>
          {t('l7.shortcut.syncFolder')}
        </Button>
      </div>
      <div className="oh-quick oh-quick--recent" data-testid="oh-quick-recent">
        <span className="oh-quick-label">{t('l7.recentPlaybooks')}</span>
        {samples.map((p) => (
          <Button variant="secondary" key={p.id} onClick={() => (onOpenRecent ? onOpenRecent(p.id) : onPlaybook())}>
            {p.name}
          </Button>
        ))}
      </div>
    </Section>
  )

  if (empty) {
    return (
      <div className="workspace-panel l7-root" data-testid="ops-home" data-ops-state="empty">
        <div className="oh-scroll">
          <div className="oh-page">
            {header}
            <EmptyState
              testId="l7-empty"
              icon="host"
              title={t('l7.emptyTitle')}
              desc={t('l7.emptyDesc')}
              primary={{ label: t('pf1.new'), onClick: onNewConnection, testId: 'l7-new-connection', command: 'connection' }}
              secondary={[
                { label: t('pf1.import'), onClick: onImport, command: 'importSessions' },
                { label: t('pf4.tryDemo'), onClick: onDemo, testId: 'l7-try-demo', command: 'demoHost' }
              ]}
            >
              <div className="oh-empty-links">
                <button type="button" className="oh-link" onClick={onTour}>
                  {t('l7.tour')}
                </button>
                {onRestoreSync ? (
                  <>
                    <span aria-hidden>·</span>
                    <button type="button" className="oh-link" onClick={onRestoreSync}>
                      {t('l7.restoreSync')}
                    </button>
                  </>
                ) : null}
              </div>
            </EmptyState>
            {quick}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="workspace-panel l7-root" data-testid="ops-home" data-ops-state="hosts">
      <div className="oh-scroll">
        <div className="oh-page">
          {header}

          {showTasks && taskTotal > 0 ? (
            <div className="oh-tasks l7-tasks" data-testid="l7-tasks">
              <span className="oh-tasks-count">{t('l7.tasks', { done: taskDone, total: taskTotal })}</span>
              <span className="oh-progress" aria-hidden>
                <i style={{ width: `${Math.round((taskDone / taskTotal) * 100)}%` }} />
              </span>
              {nextTask ? <span className="oh-tasks-next">{t('l7e.nextStep', { task: t(TASK_KEY[nextTask]) })}</span> : null}
              <button type="button" className="oh-link" onClick={onTasks}>
                {t('l7e.continue')}
              </button>
              {onDismissTasks ? (
                <Button variant="icon" icon="x" aria-label={t('l7e.hideTasks')} title={t('l7e.hideTasks')} onClick={onDismissTasks} />
              ) : null}
            </div>
          ) : null}

          <Section
            title={t('l7e.attention')}
            count={pendingCount}
            label={t('l7e.attention')}
            tools={
              <div className="oh-seg l7-filters" role="tablist" aria-label={t('l7e.attention')}>
                {(['active', 'all', 'ignored'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={inboxFilter === key}
                    className={inboxFilter === key ? 'is-on' : ''}
                    onClick={() => {
                      setInboxFilter(key)
                      setAttnFocus(0)
                    }}
                  >
                    {t(key === 'active' ? 'l2.active' : key === 'ignored' ? 'l2.dismissed' : 'l2.all')}
                  </button>
                ))}
              </div>
            }
            link={
              <>
                {muted ? (
                  <span className="oh-chip l7-mute" data-testid="l7-mute">
                    <span>{t('l7.mutedUntil', { time: new Date(mutedUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
                    <span aria-hidden>·</span>
                    <button type="button" title={t('l7.unmute')} onClick={onUnmute}>
                      {t('l7e.cancel')}
                    </button>
                  </span>
                ) : null}
                {failCount > 1 ? (
                  <button
                    type="button"
                    className="oh-link"
                    data-testid="l7c-retry-all"
                    disabled={cooling}
                    title={cooling ? t('l7c.retryCool') : t('l7c.retryAll')}
                    onClick={() => sampling.retryAll()}
                  >
                    {cooling ? t('l7c.retryCool') : t('l7c.retryAll')}
                  </button>
                ) : null}
                <button type="button" className="oh-link" onClick={() => onOpenWorkbench()}>
                  {t('l7e.workbench')}
                </button>
              </>
            }
          >
            {shownAttn.length === 0 ? (
              <div className="oh-clear" data-testid="l7-inbox-empty" role="status">
                <Icon name="check" size={14} strokeWidth={2} />
                <span className="oh-clear-title">{inboxFilter === 'active' ? t('l7e.allClear') : t('l7.noAlerts')}</span>
                <span className="oh-clear-sub">· {t('l7e.allClearSub')}</span>
                <button type="button" className="oh-link" onClick={onRules}>
                  {t('l7e.rules')}
                </button>
              </div>
            ) : (
              <div className="oh-rows l7-rows" role="list" aria-label={t('l7e.attention')} ref={rowsRef}>
                {shownAttn.map((item, i) => {
                  const isAlert = item.kind === 'alert'
                  const host = isAlert ? item.alert.hostTitle : item.host.title
                  const message = isAlert
                    ? item.alert.ruleId === 'offline'
                      ? t(RULE_KEY.offline)
                      : t('l7e.threshold', { rule: t(RULE_KEY[item.alert.ruleId]), value: `${Math.round(item.alert.value)}%`, threshold: item.alert.threshold })
                    : t('l7e.unreachableMsg', { reason: item.reason })
                  const time = isAlert ? ago(item.alert.at) : item.retryHint || (item.at ? staleHint(item.at) : '')
                  const maint = isAlert ? silenceUntil(loadMaintenance(), { keys: [item.alert.hostKey, item.alert.hostTitle], tags: [] }, now) : null
                  return (
                    <div
                      key={item.id}
                      className={`oh-row is-${item.sev}${isAlert && item.alert.status !== 'active' ? ' is-quiet' : ''}`}
                      role="listitem"
                      data-oh-row
                      data-testid={isAlert ? 'alert-line' : 'l7e-host-row'}
                      data-alert-id={isAlert ? item.alert.id : undefined}
                      tabIndex={i === Math.min(attnFocus, shownAttn.length - 1) ? 0 : -1}
                      onFocus={() => setAttnFocus(i)}
                      onClick={() => (isAlert ? onOpenWorkbench(item.alert.id) : retryHost(item.host))}
                      onKeyDown={(e) => onRowKey(e, i, item)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        rowMenu(item, e)
                      }}
                    >
                      <i className={`oh-dot oh-dot--${item.sev}`} aria-hidden />
                      <span className="oh-row-host" title={host}>{host}</span>
                      <span className="oh-row-msg" title={isAlert ? message : `${message}`}>{message}</span>
                      <span className="oh-row-time" title={maint ? t('l2d.until', { time: new Date(maint).toLocaleTimeString() }) : undefined}>{time}</span>
                      <span className="oh-row-actions" onClick={(e) => e.stopPropagation()}>
                        {isAlert ? (
                          <>
                            <Button
                              variant="secondary"
                              className="oh-mini"
                              data-testid="w1-row-explain"
                              disabled={aiConfigured === false}
                              title={aiConfigured === false ? t('w1.needAi') : t('a4.interpret')}
                              onClick={() => onExplain(item.alert)}
                            >
                              {t('a4.interpret')}
                            </Button>
                            <Button variant="secondary" className="oh-mini" onClick={() => onLocate(item.alert)}>
                              {t('l7.connect')}
                            </Button>
                            {item.alert.status === 'active' ? (
                              <Button variant="ghost" className="oh-mini" title={`${t('l2.dismiss')} (Delete)`} onClick={() => onDismiss(item.alert)}>
                                {t('l2.dismiss')}
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Button variant="secondary" className="oh-mini" data-testid="l7e-row-retry" onClick={() => retryHost(item.host)}>
                              {t('l7b.retry')}
                            </Button>
                            <Button variant="secondary" className="oh-mini" onClick={() => (onEditHost ? onEditHost(item.host.profileId) : onGuard(item.host.profileId))}>
                              {t('l7e.editHost')}
                            </Button>
                            {!item.ignored ? (
                              <Button variant="ghost" className="oh-mini" title={`${t('l2.dismiss')} (Delete)`} onClick={() => ignoreHost(item.host)}>
                                {t('l2.dismiss')}
                              </Button>
                            ) : null}
                          </>
                        )}
                        <Button
                          variant="icon"
                          className="oh-mini"
                          aria-label={t('toolbar.more')}
                          title={t('toolbar.more')}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect()
                            rowMenu(item, { clientX: r.left, clientY: r.bottom })
                          }}
                        >
                          ⋯
                        </Button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {attention.length > shownAttn.length ? (
              <button type="button" className="oh-link oh-more-rows" onClick={() => onOpenWorkbench()}>
                {t('l7e.moreRows', { n: attention.length - shownAttn.length })}
              </button>
            ) : null}
          </Section>

          <Section
            title={t('l7e.hosts')}
            count={cardSource.length}
            label={t('l7.health')}
            tools={
              <>
                <ScopePicker scope={scope} folders={folders} hosts={hosts.map((h) => ({ id: h.profileId, title: h.title }))} onChange={onScope} />
                <label className="oh-toggle">
                  <input type="checkbox" checked={probePrefs.excludeReadonly} onChange={(e) => onProbePrefs({ excludeReadonly: e.target.checked })} />
                  <span>{t('l7c.excludeReadonly')}</span>
                </label>
                {filterSummary ? <span className="l7c-summary oh-muted" title={filterSummary}>{filterSummary}</span> : null}
                {showFiltered ? <span className="oh-muted" data-testid="l7c-filtered">{t('l7c.filteredCount', { n: probeTargets.length })}</span> : null}
              </>
            }
            link={
              <button type="button" className="oh-link" onClick={onOpenDashboard}>
                {t('l7e.viewAllHosts')}
              </button>
            }
          >
            {filterEmpty ? (
              <div className="oh-clear" data-testid="l7c-empty-filter">
                <span className="oh-clear-title">{t('l7c.emptyFilter')}</span>
                <button type="button" className="oh-link" onClick={() => onProbePrefs({ filterTags: false, tags: [], prodOnly: false, excludeReadonly: false })}>
                  {t('l7c.clearFilter')}
                </button>
                <button type="button" className="oh-link" onClick={() => setProbeOpen(true)}>{t('l7b.settings')}</button>
              </div>
            ) : (
              <div className="oh-grid" role="list" aria-label={t('l7.health')} ref={gridRef}>
                {ranked.shown.length === 0 ? <p className="oh-muted oh-grid-note">{t('l7.scopeEmpty')}</p> : null}
                {ranked.shown.map((h, i) => {
                  const sessionSnap = h.sessionId ? snaps[h.sessionId] : undefined
                  const probeSnap = sampling.snaps[h.profileId]
                  const protBadge = h.protection === 'production' || h.protection === 'readonly' ? h.protection : null
                  const showDemoBadge = Boolean(h.demo) && protBadge == null
                  const failReason = probePrefs.enabled && probeSnap?.phase === 'fail' ? probeSnap.error : sessionSnap?.error
                  const cardTitle = [h.via ? `${h.demo && protBadge ? `${h.title} · ${t('l7.demoHost')}` : h.title} · ${t('m2.via', { chain: h.via })}` : h.demo && protBadge ? `${h.title} · ${t('l7.demoHost')}` : h.title, failReason].filter(Boolean).join(' — ')
                  const latency = h.latencyMs
                  const live = probePrefs.enabled ? (probeSnap?.phase === 'ok' ? probeSnap : null) : sessionSnap && !sessionSnap.error ? sessionSnap : null
                  const view = pickMetrics(live, metricCache[h.profileId])
                  return (
                    <article
                      key={h.profileId}
                      className={`oh-tile l7-card${h.alerting ? ' is-alert' : ''}${failReason ? ' is-err' : ''}`}
                      data-testid="l7-card"
                      data-oh-tile
                      role="listitem"
                      aria-label={h.title}
                      title={cardTitle}
                      tabIndex={i === Math.min(tileFocus, ranked.shown.length - 1) ? 0 : -1}
                      onFocus={() => setTileFocus(i)}
                      onKeyDown={(e) => onTileKey(e, i, h)}
                      onClick={() => onConnect(h)}
                      data-overflow="none"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu({ x: e.clientX, y: e.clientY, profileId: h.profileId, entry: 'context' })
                      }}
                    >
                      <div className="l7-card-top">
                        <span className={`l7-dot${h.online ? ' is-on' : ''}${failReason ? ' is-err' : ''}`} aria-hidden />
                        <span className="l7-card-name" data-testid="l7-card-title">{h.title}</span>
                        {protBadge ? (
                          <span className={`prot-badge prot-badge--${protBadge}`}>{t(protBadge === 'production' ? 'l4.production' : 'l4.readonly')}</span>
                        ) : showDemoBadge ? (
                          <span className="demo-badge">{t('l7.demo')}</span>
                        ) : null}
                        {h.alerting ? (
                          <span
                            className="l7-alert-dot"
                            data-flash={silenceUntil(loadMaintenance(), { keys: [h.profileId, h.title, h.host], tags: h.tags }, now) ? '0' : '1'}
                            title={t('o2.badge')}
                          />
                        ) : null}
                        <span className="l7-card-lat">{latency != null ? `${latency} ms` : h.online ? '—' : t('l7.offline')}</span>
                      </div>
                      <CardMetrics
                        view={view}
                        staleHint={view.staleAt != null ? staleHint(view.staleAt) : ''}
                        memLabel={t('l7.mem')}
                        diskLabel={t('l7.disk')}
                        probe={probePrefs.enabled && probeSnap?.phase === 'ok' ? probeSnap : undefined}
                        extraLoad={probePrefs.extraLoad}
                        extraInode={probePrefs.extraInode}
                        extraMounts={probePrefs.extraMounts}
                        missingMount={t('l7d.missingMount')}
                        fail={
                          failReason
                            ? {
                                line: probePrefs.enabled ? t('l7c.failRetry') : t('l7.unreachable'),
                                sub: probeSnap?.retryAt ? t('l7c.retryIn', { time: retryLabel(probeSnap.retryAt, now) }) : '',
                                title: failReason,
                                retry: t('l7b.retry'),
                                onRetry: (e) => {
                                  e.stopPropagation()
                                  retryHost(h)
                                }
                              }
                            : undefined
                        }
                        off={
                          !probePrefs.enabled && !h.sessionId
                            ? {
                                hint: t('l7b.autoOffHint'),
                                enable: t('l7b.enable'),
                                onEnable: (e) => {
                                  e.stopPropagation()
                                  onProbePrefs({ enabled: true })
                                }
                              }
                            : undefined
                        }
                      />
                      <div className="oh-tile-actions" onClick={(e) => e.stopPropagation()}>
                        <Button variant="secondary" className="oh-mini" onClick={() => onConnect(h)}>
                          {t('l7e.terminal')}
                        </Button>
                        <Button variant="secondary" className="oh-mini" onClick={() => (onOpenHostSftp ? onOpenHostSftp(h) : onOpenSftp?.())}>
                          SFTP
                        </Button>
                        <Button variant="secondary" className="oh-mini" onClick={() => onOpenMonitor(h)}>
                          {t('l7e.monitor')}
                        </Button>
                      </div>
                    </article>
                  )
                })}
                <button type="button" className="oh-tile oh-tile-add" title="Ctrl+Shift+N" onClick={onNewConnection}>
                  <Icon name="plus" size={14} strokeWidth={2} />
                  {t('l7.newConnection')}
                </button>
              </div>
            )}
            {ranked.more > 0 ? <p className="oh-muted oh-grid-note">{t('l7.moreHosts', { n: ranked.more })}</p> : null}
          </Section>

          {quick}
        </div>
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

/** A page section: title (+count), tools beside it, a link on the right, then the body. */
function Section({
  title,
  count,
  label,
  tools,
  link,
  children
}: {
  title: string
  count?: number
  label?: string
  tools?: ReactNode
  link?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="oh-section" aria-label={label ?? title}>
      <header className="oh-section-head">
        <h3 className="oh-section-title">
          {title}
          {count != null ? <span className="oh-count">{count}</span> : null}
        </h3>
        {tools ? <div className="oh-section-tools">{tools}</div> : null}
        {link ? <div className="oh-section-link">{link}</div> : null}
      </header>
      {children}
    </section>
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
      <span className="l7-metric-val">{known ? `${Math.round(value)}%` : '—'}</span>
    </div>
  )
}

/**
 * Tile metrics. Never a loading state: live → cached (muted "上次 · N 分钟前") → "—".
 * Failure / auto-sampling-off add one muted line under the bars.
 */
function CardMetrics({
  view,
  staleHint,
  memLabel,
  diskLabel,
  probe,
  extraLoad,
  extraInode,
  extraMounts,
  missingMount,
  fail,
  off
}: {
  view: MetricView
  staleHint: string
  memLabel: string
  diskLabel: string
  probe?: {
    load?: [number, number, number] | null
    inode?: number | null
    mounts?: Array<{ path: string; percent: number | null; missing?: boolean }>
  }
  extraLoad?: boolean
  extraInode?: boolean
  extraMounts?: boolean
  missingMount?: string
  fail?: { line: string; sub: string; title: string; retry: string; onRetry: (e: MouseEvent) => void }
  off?: { hint: string; enable: string; onEnable: (e: MouseEvent) => void }
}) {
  return (
    <>
      <div className={`l7-metrics${view.staleAt != null ? ' is-stale' : ''}`} data-known={view.known ? '1' : '0'}>
        <Metric label="CPU" value={view.cpu} />
        <Metric label={memLabel} value={view.mem} />
        <Metric label={diskLabel} value={view.disk} />
        {extraLoad && probe?.load ? (
          <div className="l7d-line" data-testid="l7d-load-line">{`LOAD ${probe.load.map((n) => n.toFixed(2)).join(' ')}`}</div>
        ) : null}
        {extraInode && probe?.inode != null ? (
          <div className={`l7d-line${probe.inode >= 90 ? ' is-warn' : ''}`} data-testid="l7d-inode-line">{`INO ${Math.round(probe.inode)}%`}</div>
        ) : null}
        {extraMounts
          ? (probe?.mounts ?? []).map((m) => (
              <div key={m.path} className="l7d-line" data-testid="l7d-mount-line" title={m.missing ? missingMount : undefined}>
                {m.missing ? `${m.path} —` : `${m.path} ${Math.round(m.percent ?? 0)}%`}
              </div>
            ))
          : null}
      </div>
      {fail ? (
        <div className="l7-card-err l7c-fail" title={fail.title} data-testid="l7c-fail">
          <span className="l7c-fail-line">{fail.line}</span>
          {fail.sub ? <span className="l7c-fail-sub">{fail.sub}</span> : null}
          <button type="button" className="oh-link" data-testid="l7b-retry" onClick={fail.onRetry}>
            {fail.retry}
          </button>
        </div>
      ) : staleHint ? (
        <span className="oh-stale" data-testid="mc-stale-hint">{staleHint}</span>
      ) : off ? (
        <div className="l7b-off">
          <span>{off.hint}</span>
          <button type="button" className="oh-link" onClick={off.onEnable}>
            {off.enable}
          </button>
        </div>
      ) : null}
    </>
  )
}
