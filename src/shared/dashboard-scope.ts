/** Shared scope for the ops home health strip and the O1 dashboard. */

export type DashScope = {
  mode: 'all' | 'group' | 'custom'
  folderId?: string
  ids?: string[]
}

export const DASH_SCOPE_LS_KEY = 'aiss.dashboard.scope.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadDashScope(store: Pick<Storage, 'getItem'> = globalThis.localStorage): DashScope {
  try {
    const raw = store.getItem(DASH_SCOPE_LS_KEY)
    if (!raw) return { mode: 'all' }
    const parsed = JSON.parse(raw) as DashScope
    if (parsed?.mode === 'group') return { mode: 'group', folderId: parsed.folderId }
    if (parsed?.mode === 'custom') return { mode: 'custom', ids: Array.isArray(parsed.ids) ? parsed.ids : [] }
    return { mode: 'all' }
  } catch {
    return { mode: 'all' }
  }
}

export function saveDashScope(scope: DashScope, store: Store = globalThis.localStorage): void {
  store.setItem(DASH_SCOPE_LS_KEY, JSON.stringify(scope))
}

export function hostInScope(scope: DashScope, host: { profileId: string; folderId?: string }): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'group') return Boolean(scope.folderId) && host.folderId === scope.folderId
  return (scope.ids ?? []).includes(host.profileId)
}

/** Alerting hosts first, then a hard cap so the home strip stays small. */
export function pickHealthHosts<T>(items: T[], isAlert: (item: T) => boolean, limit = 8): { shown: T[]; more: number } {
  const sorted = [...items].sort((a, b) => Number(isAlert(b)) - Number(isAlert(a)))
  return { shown: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) }
}
