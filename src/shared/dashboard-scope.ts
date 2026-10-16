/** Shared scope for the ops home health strip and the O1 dashboard. */

export type DashScope = {
  mode: 'all' | 'group' | 'custom'
  folderId?: string
  ids?: string[]
  /** Profile ids hidden from the dashboard. Restored by undo. */
  hiddenIds?: string[]
}

export const DASH_SCOPE_LS_KEY = 'aiss.dashboard.scope.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadDashScope(store: Pick<Storage, 'getItem'> = globalThis.localStorage): DashScope {
  try {
    const raw = store.getItem(DASH_SCOPE_LS_KEY)
    if (!raw) return { mode: 'all' }
    const parsed = JSON.parse(raw) as DashScope
    const hiddenIds = Array.isArray(parsed?.hiddenIds) ? parsed.hiddenIds.filter((id) => typeof id === 'string') : []
    const hidden = hiddenIds.length ? { hiddenIds } : {}
    if (parsed?.mode === 'group') return { mode: 'group', folderId: parsed.folderId, ...hidden }
    if (parsed?.mode === 'custom') return { mode: 'custom', ids: Array.isArray(parsed.ids) ? parsed.ids : [], ...hidden }
    return { mode: 'all', ...hidden }
  } catch {
    return { mode: 'all' }
  }
}

export function saveDashScope(scope: DashScope, store: Store = globalThis.localStorage): void {
  store.setItem(DASH_SCOPE_LS_KEY, JSON.stringify(scope))
}

export function hideFromDashboard(scope: DashScope, profileId: string): DashScope {
  const hiddenIds = [...new Set([...(scope.hiddenIds ?? []), profileId])]
  return { ...scope, hiddenIds }
}

export function restoreToDashboard(scope: DashScope, profileId: string): DashScope {
  const hiddenIds = (scope.hiddenIds ?? []).filter((id) => id !== profileId)
  const next = { ...scope }
  if (hiddenIds.length) next.hiddenIds = hiddenIds
  else delete next.hiddenIds
  return next
}

export function hostInScope(scope: DashScope, host: { profileId: string; folderId?: string }): boolean {
  if (scope.hiddenIds?.includes(host.profileId)) return false
  if (scope.mode === 'all') return true
  if (scope.mode === 'group') return Boolean(scope.folderId) && host.folderId === scope.folderId
  return (scope.ids ?? []).includes(host.profileId)
}

/** Alerting hosts first, then a hard cap so the home strip stays small. */
export function pickHealthHosts<T>(items: T[], isAlert: (item: T) => boolean, limit = 8): { shown: T[]; more: number } {
  const sorted = [...items].sort((a, b) => Number(isAlert(b)) - Number(isAlert(a)))
  return { shown: sorted.slice(0, limit), more: Math.max(0, sorted.length - limit) }
}
