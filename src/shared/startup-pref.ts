/** L7 startup: ops home (default), last session, or a blank workspace. */

export type StartupMode = 'home' | 'last' | 'blank'

export const STARTUP_LS_KEY = 'aiss.startup.v1'
export const LAST_WORKSPACE_LS_KEY = 'aiss.startup.last.v1'
/** PNG-4: 「恢复上次布局」. Missing key means on. */
export const RESTORE_LAYOUT_LS_KEY = 'aiss.startup.restoreLayout.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadStartupMode(store: Pick<Storage, 'getItem'> = globalThis.localStorage): StartupMode {
  const raw = store.getItem(STARTUP_LS_KEY)
  if (raw === 'last' || raw === 'blank' || raw === 'home') return raw
  return 'home'
}

export function saveStartupMode(mode: StartupMode, store: Store = globalThis.localStorage): void {
  store.setItem(STARTUP_LS_KEY, mode)
}

/** Defaults on. Only an explicit `0` turns last-layout restore off. */
export function loadRestoreLayout(store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  try {
    return store.getItem(RESTORE_LAYOUT_LS_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveRestoreLayout(on: boolean, store: Store = globalThis.localStorage): void {
  store.setItem(RESTORE_LAYOUT_LS_KEY, on ? '1' : '0')
}

/** A center tab remembered for "last session". Scrollback is intentionally absent. */
export type SavedWorkspaceTab = {
  kind: string
  profileId?: string
  title: string
  order: number
  toolboxTab?: string
  focusAlertId?: string
  settingsSection?: string
  playbookId?: string
  active?: boolean
  /** Tab pin; restored with arrangeTabs (pinned first). */
  pinned?: boolean
}

export type LastWorkspace = { profileIds: string[]; tabs?: SavedWorkspaceTab[] }

function cleanTab(raw: unknown, order: number): SavedWorkspaceTab | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<SavedWorkspaceTab>
  if (typeof o.kind !== 'string' || !o.kind) return null
  return {
    kind: o.kind,
    profileId: typeof o.profileId === 'string' ? o.profileId : undefined,
    title: typeof o.title === 'string' ? o.title : o.kind,
    order: typeof o.order === 'number' ? o.order : order,
    toolboxTab: typeof o.toolboxTab === 'string' ? o.toolboxTab : undefined,
    focusAlertId: typeof o.focusAlertId === 'string' ? o.focusAlertId : undefined,
    settingsSection: typeof o.settingsSection === 'string' ? o.settingsSection : undefined,
    playbookId: typeof o.playbookId === 'string' ? o.playbookId : undefined,
    active: o.active === true,
    pinned: o.pinned === true
  }
}

export function loadLastWorkspace(store: Pick<Storage, 'getItem'> = globalThis.localStorage): LastWorkspace {
  try {
    const raw = store.getItem(LAST_WORKSPACE_LS_KEY)
    if (!raw) return { profileIds: [] }
    const parsed = JSON.parse(raw) as LastWorkspace
    const ids = Array.isArray(parsed?.profileIds) ? parsed.profileIds.filter((id) => typeof id === 'string') : []
    const tabs = Array.isArray(parsed?.tabs) ? parsed.tabs.map((row, i) => cleanTab(row, i)).filter((row): row is SavedWorkspaceTab => Boolean(row)) : []
    return { profileIds: ids, tabs }
  } catch {
    return { profileIds: [] }
  }
}

export function saveLastWorkspace(state: LastWorkspace, store: Store = globalThis.localStorage): void {
  store.setItem(LAST_WORKSPACE_LS_KEY, JSON.stringify({ profileIds: state.profileIds, tabs: state.tabs ?? [] }))
}
