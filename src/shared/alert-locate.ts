/** O4: jump from an alert to the matching toolbox tab. State stays until recover or ignore. */
import type { FiredAlert } from './alert-rules'

export type ToolboxLocateTab = 'df' | 'processes' | 'services'

export type LocateTarget =
  | { kind: 'toolbox'; tab: ToolboxLocateTab }
  | { kind: 'terminal' }

/** disk full → df; CPU/mem → processes; service → systemd; offline → focus the host terminal. */
export function locateTargetFor(ruleId: string): LocateTarget {
  if (ruleId === 'disk') return { kind: 'toolbox', tab: 'df' }
  if (ruleId === 'cpu' || ruleId === 'mem') return { kind: 'toolbox', tab: 'processes' }
  if (ruleId === 'service') return { kind: 'toolbox', tab: 'services' }
  return { kind: 'terminal' }
}

export type AlertLife = FiredAlert['status']

const RANK: Record<string, number> = { disk: 4, service: 3, cpu: 2, mem: 2, offline: 1 }

export function alertKey(hostKey: string, ruleId: string): string {
  return `${hostKey}:${ruleId}`
}

/** Mark active alerts recovered once their metric is no longer breaching. Ignored alerts recover the same way so a later breach can fire again. */
export function reconcileAlerts(history: FiredAlert[], breaching: Set<string>, now = Date.now()): FiredAlert[] {
  return history.map((a) => {
    if (a.status !== 'active' && a.status !== 'ignored') return a
    if (breaching.has(alertKey(a.hostKey, a.ruleId))) return a
    return { ...a, status: 'recovered', recoveredAt: a.recoveredAt ?? now }
  })
}

export function ignoreAlert(history: FiredAlert[], id: string): FiredAlert[] {
  return history.map((a) => (a.id === id && a.status === 'active' ? { ...a, status: 'ignored' } : a))
}

/** Hosts that should stay red: live breach or an active (not ignored) alert. */
export function alertHostIds(history: FiredAlert[], breaching: Set<string>): Set<string> {
  const ignored = new Set(history.filter((a) => a.status === 'ignored').map((a) => alertKey(a.hostKey, a.ruleId)))
  const hosts = new Set<string>()
  for (const a of history) {
    if (a.status === 'active') hosts.add(a.hostKey)
  }
  for (const key of breaching) {
    if (ignored.has(key)) continue
    const i = key.lastIndexOf(':')
    if (i > 0) hosts.add(key.slice(0, i))
  }
  return hosts
}

export function primaryAlert(history: FiredAlert[], hostKey: string): FiredAlert | null {
  const list = history.filter((a) => a.hostKey === hostKey && a.status === 'active')
  if (!list.length) return null
  return [...list].sort((a, b) => (RANK[b.ruleId] ?? 0) - (RANK[a.ruleId] ?? 0) || b.at - a.at)[0]!
}
