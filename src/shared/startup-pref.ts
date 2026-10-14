/** L7 startup: ops home (default), last session, or a blank workspace. */

export type StartupMode = 'home' | 'last' | 'blank'

export const STARTUP_LS_KEY = 'aiss.startup.v1'
export const LAST_WORKSPACE_LS_KEY = 'aiss.startup.last.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadStartupMode(store: Pick<Storage, 'getItem'> = globalThis.localStorage): StartupMode {
  const raw = store.getItem(STARTUP_LS_KEY)
  if (raw === 'last' || raw === 'blank' || raw === 'home') return raw
  return 'home'
}

export function saveStartupMode(mode: StartupMode, store: Store = globalThis.localStorage): void {
  store.setItem(STARTUP_LS_KEY, mode)
}

export type LastWorkspace = { profileIds: string[] }

export function loadLastWorkspace(store: Pick<Storage, 'getItem'> = globalThis.localStorage): LastWorkspace {
  try {
    const raw = store.getItem(LAST_WORKSPACE_LS_KEY)
    if (!raw) return { profileIds: [] }
    const parsed = JSON.parse(raw) as LastWorkspace
    const ids = Array.isArray(parsed?.profileIds) ? parsed.profileIds.filter((id) => typeof id === 'string') : []
    return { profileIds: ids }
  } catch {
    return { profileIds: [] }
  }
}

export function saveLastWorkspace(state: LastWorkspace, store: Store = globalThis.localStorage): void {
  store.setItem(LAST_WORKSPACE_LS_KEY, JSON.stringify({ profileIds: state.profileIds }))
}
