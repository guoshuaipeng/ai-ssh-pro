/** L2c: built-in alert packs write the existing local rule store. They never run a command. */
import {
  DEFAULT_ALERT_RULES,
  type AlertRule,
  type AlertRulesState,
  type AlertScope,
  type PackRule
} from './alert-rules'

export const ALERT_PACK_IDS = ['pack.cpu-high', 'pack.disk-full', 'pack.proc-svc'] as const

export type AlertPackId = (typeof ALERT_PACK_IDS)[number]

export type AlertPack = {
  id: AlertPackId
  /** How many local rows an enable writes. */
  ruleCount: 1
  metric: 'cpu' | 'disk' | 'proc'
  threshold: number
  sustainMin: number
  severity: 'warning' | 'critical'
  unit?: string
}

export const ALERT_PACKS: readonly AlertPack[] = [
  { id: 'pack.cpu-high', ruleCount: 1, metric: 'cpu', threshold: 90, sustainMin: 2, severity: 'critical' },
  { id: 'pack.disk-full', ruleCount: 1, metric: 'disk', threshold: 90, sustainMin: 0, severity: 'warning' },
  { id: 'pack.proc-svc', ruleCount: 1, metric: 'proc', threshold: 0, sustainMin: 0, severity: 'critical', unit: 'sshd' }
]

export type EnablePackOptions = {
  scope?: AlertScope
  hostIds?: string[]
  folderId?: string
  threshold?: number
  sustainMin?: number
  unit?: string
}

const FORBIDDEN = ['command', 'autoRun', 'autoExec', 'password', 'privateKey', 'token', 'playbookId']

export function packById(id: string): AlertPack | undefined {
  return ALERT_PACKS.find((p) => p.id === id)
}

export function alertingMasterOn(state: AlertRulesState): boolean {
  return state.notify.systemNotify !== false
}

function scopeOf(opts: EnablePackOptions): { scope: AlertScope; hostIds: string[]; folderId?: string } {
  const scope: AlertScope = opts.scope === 'group' || opts.scope === 'hosts' ? opts.scope : 'all'
  return {
    scope,
    hostIds: scope === 'hosts' ? (opts.hostIds ?? []).filter(Boolean) : [],
    folderId: scope === 'group' ? opts.folderId : undefined
  }
}

export function packRulesFor(state: AlertRulesState, packId: string): Array<AlertRule | PackRule> {
  const builtin = state.rules.filter((r) => r.packId === packId)
  const extra = (state.packRules ?? []).filter((r) => r.packId === packId)
  return [...builtin, ...extra]
}

export function packStatus(state: AlertRulesState, packId: string): { enabled: boolean; customized: boolean } {
  const rows = packRulesFor(state, packId)
  if (!rows.length) return { enabled: false, customized: false }
  const pack = packById(packId)
  const customized = rows.some((row) => {
    if (row.customized) return true
    if (!pack) return false
    if (pack.metric === 'proc') return (row as PackRule).unit !== pack.unit
    return row.threshold !== pack.threshold || row.sustainMin !== pack.sustainMin
  })
  return { enabled: true, customized }
}

/** Write one pack into the local rule list. A second enable does not insert a duplicate. */
export function enableAlertPack(
  state: AlertRulesState,
  packId: string,
  opts: EnablePackOptions = {}
): { state: AlertRulesState; status: 'wrote' | 'duplicate' } {
  const pack = packById(packId)
  if (!pack) return { state, status: 'duplicate' }
  if (packStatus(state, pack.id).enabled) return { state, status: 'duplicate' }
  const placed = scopeOf(opts)
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : pack.threshold
  const sustainMin = typeof opts.sustainMin === 'number' ? opts.sustainMin : pack.sustainMin
  const unit = (opts.unit || pack.unit || 'sshd').trim() || 'sshd'
  const customized = threshold !== pack.threshold || sustainMin !== pack.sustainMin || (pack.metric === 'proc' && unit !== pack.unit)
  if (pack.metric === 'proc') {
    const row: PackRule = {
      id: pack.id,
      packId: pack.id,
      metric: 'proc',
      enabled: true,
      threshold: 0,
      sustainMin: 0,
      severity: 'critical',
      scope: placed.scope,
      hostIds: placed.hostIds,
      folderId: placed.folderId,
      unit,
      customized: customized || undefined
    }
    return { state: { ...state, packRules: [...(state.packRules ?? []).filter((r) => r.packId !== pack.id), row] }, status: 'wrote' }
  }
  const rules = state.rules.map((rule) => {
    if (rule.id !== pack.metric) return rule
    const next: AlertRule = {
      ...rule,
      enabled: true,
      threshold,
      sustainMin,
      packId: pack.id,
      severity: pack.severity,
      scope: placed.scope,
      hostIds: placed.hostIds,
      folderId: placed.folderId,
      customized: customized || undefined
    }
    return next
  })
  return { state: { ...state, rules }, status: 'wrote' }
}

export function setPackEnabled(state: AlertRulesState, packId: string, enabled: boolean): AlertRulesState {
  return {
    ...state,
    rules: state.rules.map((rule) => (rule.packId === packId ? { ...rule, enabled } : rule)),
    packRules: (state.packRules ?? []).map((rule) => (rule.packId === packId ? { ...rule, enabled } : rule))
  }
}

export function updatePackRule(
  state: AlertRulesState,
  packId: string,
  patch: { threshold?: number; sustainMin?: number; unit?: string; scope?: AlertScope; hostIds?: string[] }
): AlertRulesState {
  const pack = packById(packId)
  const rules = state.rules.map((rule) => {
    if (rule.packId !== packId) return rule
    const next = { ...rule, ...patch }
    next.customized = Boolean(pack && (next.threshold !== pack.threshold || next.sustainMin !== pack.sustainMin))
    return next
  })
  const packRules = (state.packRules ?? []).map((rule) => {
    if (rule.packId !== packId) return rule
    const next = { ...rule, ...patch }
    next.customized = Boolean(pack && pack.metric === 'proc' && next.unit !== pack.unit)
    return next
  })
  return { ...state, rules, packRules }
}

/** Delete every row from the pack. Built-in CPU/disk rules return to factory defaults. */
export function removeAlertPack(state: AlertRulesState, packId: string): AlertRulesState {
  const rules = state.rules.map((rule) => {
    if (rule.packId !== packId) return rule
    const factory = DEFAULT_ALERT_RULES.find((d) => d.id === rule.id)
    return factory ? { ...factory } : rule
  })
  return {
    ...state,
    rules,
    packRules: (state.packRules ?? []).filter((rule) => rule.packId !== packId)
  }
}

export function defaultRulesSegment(state: AlertRulesState): 'mine' | 'templates' {
  const any = ALERT_PACKS.some((pack) => packStatus(state, pack.id).enabled)
  return any ? 'mine' : 'templates'
}

/** Template payloads are data only. */
export function packPayloadHasNoExecution(pack: AlertPack): boolean {
  const json = JSON.stringify(pack)
  return FORBIDDEN.every((key) => !json.includes(`"${key}"`))
}
