/** L2: views over the O2 alert history. O2 remains the source of truth. */
import type { FiredAlert } from './alert-rules'

export type AlertFilter = 'active' | 'all' | 'ignored' | 'recovered'

export type BellMode = 'workbench' | 'drawer'

export type BellPrefs = {
  mode: BellMode
  /** Notification click also runs O4 locate. Default on. */
  autoLocate: boolean
  /** Also push the explain round into the right-hand AI panel. Default off. */
  mirrorAi: boolean
}

export const BELL_PREFS_LS_KEY = 'aiss.alert.bell.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export const DEFAULT_BELL_PREFS: BellPrefs = { mode: 'workbench', autoLocate: true, mirrorAi: false }

export function loadBellPrefs(store: Pick<Storage, 'getItem'> = globalThis.localStorage): BellPrefs {
  try {
    const raw = store.getItem(BELL_PREFS_LS_KEY)
    if (!raw) return { ...DEFAULT_BELL_PREFS }
    const parsed = JSON.parse(raw) as Partial<BellPrefs>
    return {
      mode: parsed.mode === 'drawer' ? 'drawer' : 'workbench',
      autoLocate: parsed.autoLocate !== false,
      mirrorAi: parsed.mirrorAi === true
    }
  } catch {
    return { ...DEFAULT_BELL_PREFS }
  }
}

export function saveBellPrefs(prefs: BellPrefs, store: Store = globalThis.localStorage): void {
  store.setItem(BELL_PREFS_LS_KEY, JSON.stringify(prefs))
}

export function filterAlerts(
  list: FiredAlert[],
  f: { status: AlertFilter; host?: string; rule?: string; q?: string }
): FiredAlert[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return list
    .filter((a) => {
      if (f.status === 'active' && a.status !== 'active') return false
      if (f.status === 'ignored' && a.status !== 'ignored') return false
      if (f.status === 'recovered' && a.status !== 'recovered') return false
      if (f.host && a.hostTitle !== f.host && a.hostKey !== f.host) return false
      if (f.rule && a.ruleId !== f.rule) return false
      if (q && !`${a.hostTitle} ${a.ruleId} ${a.value}`.toLowerCase().includes(q)) return false
      return true
    })
    .sort((a, b) => b.at - a.at)
}

/** User says it is fixed; do not wait for the metric to recover. */
export function markHandled(history: FiredAlert[], id: string, now = Date.now()): FiredAlert[] {
  return history.map((a) =>
    a.id === id ? { ...a, status: 'recovered' as const, recoveredAt: a.recoveredAt ?? now, handledManually: true } : a
  )
}

export function ageBucket(at: number, now: number): { key: 'just' | 'min' | 'hour' | 'day'; n: number } {
  const sec = Math.max(0, now - at) / 1000
  if (sec < 60) return { key: 'just', n: 0 }
  if (sec < 3600) return { key: 'min', n: Math.max(1, Math.floor(sec / 60)) }
  if (sec < 86400) return { key: 'hour', n: Math.max(1, Math.floor(sec / 3600)) }
  return { key: 'day', n: Math.max(1, Math.floor(sec / 86400)) }
}

export function activeCount(list: FiredAlert[]): number {
  return list.reduce((n, a) => n + (a.status === 'active' ? 1 : 0), 0)
}
