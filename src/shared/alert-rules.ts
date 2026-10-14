/** O2: threshold alert rules + evaluation against ResourceSnapshot. */
import type { ResourceSnapshot } from './resource-monitor'

export type AlertMetric = 'cpu' | 'mem' | 'disk' | 'offline'

export type AlertRule = {
  id: AlertMetric
  enabled: boolean
  threshold: number
  /** minutes of sustained breach before fire (offline uses minutes too) */
  sustainMin: number
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

export function loadAlertRules(): AlertRulesState {
  try {
    const raw = localStorage.getItem(ALERT_LS_KEY)
    if (!raw) return { rules: DEFAULT_ALERT_RULES.map((r) => ({ ...r })), notify: { ...DEFAULT_ALERT_NOTIFY }, mutedUntil: null }
    const parsed = JSON.parse(raw) as Partial<AlertRulesState>
    const byId = new Map((parsed.rules ?? []).map((r) => [r.id, r]))
    const rules = DEFAULT_ALERT_RULES.map((d) => ({ ...d, ...(byId.get(d.id) ?? {}) }))
    return {
      rules,
      notify: { ...DEFAULT_ALERT_NOTIFY, ...(parsed.notify ?? {}) },
      mutedUntil: typeof parsed.mutedUntil === 'number' ? parsed.mutedUntil : null
    }
  } catch {
    return { rules: DEFAULT_ALERT_RULES.map((r) => ({ ...r })), notify: { ...DEFAULT_ALERT_NOTIFY }, mutedUntil: null }
  }
}

export function saveAlertRules(state: AlertRulesState): void {
  localStorage.setItem(ALERT_LS_KEY, JSON.stringify(state))
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
export function evaluateAlerts(opts: {
  hostKey: string
  hostTitle: string
  rules: AlertRule[]
  readings: MetricReading[]
  breachSince: Map<string, number>
  lastFiredAt: Map<string, number>
  now?: number
  cooldownMs?: number
}): FiredAlert[] {
  const now = opts.now ?? Date.now()
  const cooldown = opts.cooldownMs ?? 30 * 60 * 1000
  const fired: FiredAlert[] = []
  const byMetric = new Map(opts.readings.map((r) => [r.metric, r.value]))

  for (const rule of opts.rules) {
    if (!rule.enabled) {
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
