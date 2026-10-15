/** O2: threshold alert rules + evaluation against ResourceSnapshot. */
import type { ResourceSnapshot } from './resource-monitor'

export type AlertMetric = 'cpu' | 'mem' | 'disk' | 'offline'

export type AlertScope = 'all' | 'group' | 'hosts'

export type AlertSeverity = 'warning' | 'critical'

/** L2c: a template-sourced rule kept in the same alert store (not a second database). */
export type PackRule = {
  id: string
  packId: string
  metric: AlertMetric | 'proc'
  enabled: boolean
  threshold: number
  sustainMin: number
  severity: AlertSeverity
  scope: AlertScope
  hostIds: string[]
  folderId?: string
  unit?: string
  customized?: boolean
}

export type AlertRule = {
  id: AlertMetric
  enabled: boolean
  threshold: number
  /** minutes of sustained breach before fire (offline uses minutes too) */
  sustainMin: number
  packId?: string
  customized?: boolean
  severity?: AlertSeverity
  scope?: AlertScope
  hostIds?: string[]
  folderId?: string
}

export type AlertNotifyPrefs = {
  systemNotify: boolean
  markRed: boolean
  sound: boolean
  notifyOnRecover: boolean
}

export type AlertRulesState = {
  rules: AlertRule[]
  notify: AlertNotifyPrefs
  mutedUntil: number | null
  /** L2c process/service rows. CPU and disk packs write the built-in rule instead. */
  packRules: PackRule[]
}

export type FiredAlert = {
  id: string
  hostKey: string
  hostTitle: string
  ruleId: AlertMetric
  value: number
  threshold: number
  at: number
  status: 'active' | 'recovered' | 'ignored'
  recoveredAt?: number
  /** L2: user marked the alert handled without waiting for the metric to recover. */
  handledManually?: boolean
}

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  { id: 'cpu', enabled: true, threshold: 90, sustainMin: 5 },
  { id: 'mem', enabled: true, threshold: 90, sustainMin: 5 },
  { id: 'disk', enabled: true, threshold: 85, sustainMin: 0 },
  { id: 'offline', enabled: true, threshold: 0, sustainMin: 2 }
]

export const DEFAULT_ALERT_NOTIFY: AlertNotifyPrefs = {
  systemNotify: true,
  markRed: true,
  sound: false,
  notifyOnRecover: false
}

export const ALERT_LS_KEY = 'aiss.alert.rules.v1'
export const ALERT_HISTORY_LS_KEY = 'aiss.alert.history.v1'

function blankRules(): AlertRulesState {
  return { rules: DEFAULT_ALERT_RULES.map((r) => ({ ...r })), notify: { ...DEFAULT_ALERT_NOTIFY }, mutedUntil: null, packRules: [] }
}

function asScope(value: unknown): AlertScope {
  return value === 'group' || value === 'hosts' ? value : 'all'
}

function normalizePackRule(raw: unknown): PackRule | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<PackRule>
  if (typeof o.id !== 'string' || typeof o.packId !== 'string') return null
  const metric = o.metric === 'cpu' || o.metric === 'mem' || o.metric === 'disk' || o.metric === 'offline' || o.metric === 'proc' ? o.metric : null
  if (!metric) return null
  return {
    id: o.id,
    packId: o.packId,
    metric,
    enabled: o.enabled !== false,
    threshold: typeof o.threshold === 'number' ? o.threshold : 0,
    sustainMin: typeof o.sustainMin === 'number' ? o.sustainMin : 0,
    severity: o.severity === 'warning' ? 'warning' : 'critical',
    scope: asScope(o.scope),
    hostIds: Array.isArray(o.hostIds) ? o.hostIds.filter((id): id is string => typeof id === 'string') : [],
    folderId: typeof o.folderId === 'string' ? o.folderId : undefined,
    unit: typeof o.unit === 'string' ? o.unit : undefined,
    customized: Boolean(o.customized) || undefined
  }
}

export function loadAlertRules(store: Pick<Storage, 'getItem'> = globalThis.localStorage): AlertRulesState {
  try {
    const raw = store.getItem(ALERT_LS_KEY)
    if (!raw) return blankRules()
    const parsed = JSON.parse(raw) as Partial<AlertRulesState>
    const byId = new Map((parsed.rules ?? []).map((r) => [r.id, r]))
    const rules = DEFAULT_ALERT_RULES.map((d) => {
      const saved = byId.get(d.id)
      const rule: AlertRule = { ...d, ...(saved ?? {}) }
      if (saved?.scope) rule.scope = asScope(saved.scope)
      if (Array.isArray(saved?.hostIds)) rule.hostIds = saved.hostIds.filter((id) => typeof id === 'string')
      return rule
    })
    return {
      rules,
      notify: { ...DEFAULT_ALERT_NOTIFY, ...(parsed.notify ?? {}) },
      mutedUntil: typeof parsed.mutedUntil === 'number' ? parsed.mutedUntil : null,
      packRules: Array.isArray(parsed.packRules) ? parsed.packRules.map(normalizePackRule).filter((r): r is PackRule => Boolean(r)) : []
    }
  } catch {
    return blankRules()
  }
}

export function saveAlertRules(state: AlertRulesState, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(ALERT_LS_KEY, JSON.stringify({ ...state, packRules: state.packRules ?? [] }))
}

export function loadAlertHistory(): FiredAlert[] {
  try {
    const raw = localStorage.getItem(ALERT_HISTORY_LS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as FiredAlert[]
    return Array.isArray(list) ? list.slice(0, 200) : []
  } catch {
    return []
  }
}

export function saveAlertHistory(list: FiredAlert[]): void {
  localStorage.setItem(ALERT_HISTORY_LS_KEY, JSON.stringify(list.slice(0, 200)))
}

export type MetricReading = { metric: AlertMetric; value: number }

export function readingsFromSnapshot(snap: ResourceSnapshot | null, online: boolean): MetricReading[] {
  if (!online) return [{ metric: 'offline', value: 1 }]
  if (!snap) return []
  const out: MetricReading[] = []
  if (snap.cpuPercent != null) out.push({ metric: 'cpu', value: snap.cpuPercent })
  if (snap.mem?.percent != null) out.push({ metric: 'mem', value: snap.mem.percent })
  if (snap.disks?.length) out.push({ metric: 'disk', value: Math.max(...snap.disks.map((d) => d.percent)) })
  return out
}

/** Returns newly fired alerts (not yet in cooldown). breachSinceMs tracks continuous breach start. */
function ruleMatchesHost(rule: AlertRule, opts: { profileId?: string; folderId?: string }): boolean {
  if (rule.scope === 'hosts' && rule.hostIds?.length) {
    return Boolean(opts.profileId && rule.hostIds.includes(opts.profileId))
  }
  if (rule.scope === 'group' && rule.folderId) return opts.folderId === rule.folderId
  return true
}

export function evaluateAlerts(opts: {
  hostKey: string
  hostTitle: string
  rules: AlertRule[]
  readings: MetricReading[]
  breachSince: Map<string, number>
  lastFiredAt: Map<string, number>
  now?: number
  cooldownMs?: number
  profileId?: string
  folderId?: string
}): FiredAlert[] {
  const now = opts.now ?? Date.now()
  const cooldown = opts.cooldownMs ?? 30 * 60 * 1000
  const fired: FiredAlert[] = []
  const byMetric = new Map(opts.readings.map((r) => [r.metric, r.value]))

  for (const rule of opts.rules) {
    if (!rule.enabled || !ruleMatchesHost(rule, opts)) {
      opts.breachSince.delete(`${opts.hostKey}:${rule.id}`)
      continue
    }
    const key = `${opts.hostKey}:${rule.id}`
    let breached = false
    let value = 0
    if (rule.id === 'offline') {
      value = byMetric.get('offline') ?? 0
      breached = value >= 1
    } else {
      value = byMetric.get(rule.id) ?? -1
      breached = value >= rule.threshold
    }
    if (!breached) {
      opts.breachSince.delete(key)
      continue
    }
    if (!opts.breachSince.has(key)) opts.breachSince.set(key, now)
    const since = opts.breachSince.get(key)!
    const needMs = (rule.sustainMin || 0) * 60 * 1000
    if (now - since < needMs) continue
    const last = opts.lastFiredAt.get(key) ?? 0
    if (now - last < cooldown) continue
    opts.lastFiredAt.set(key, now)
    fired.push({
      id: `${key}:${now}`,
      hostKey: opts.hostKey,
      hostTitle: opts.hostTitle,
      ruleId: rule.id,
      value,
      threshold: rule.threshold,
      at: now,
      status: 'active'
    })
  }
  return fired
}
