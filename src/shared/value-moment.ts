/** PNG-6: import success and the first successful connect. Non-blocking, never on the welcome card. */

export const IMPORT_HINT_OFF_KEY = 'aiss.prefs.png.importOff'
export const FIRST_CONNECT_OFF_KEY = 'aiss.prefs.png.firstConnectOff'
export const FIRST_CONNECT_SEEN_KEY = 'aiss.prefs.png.firstConnectSeen'

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function loadPrefFlag(key: string, store: Pick<Storage, 'getItem'> = globalThis.localStorage): boolean {
  try {
    return store.getItem(key) === '1'
  } catch {
    return false
  }
}

export function savePrefFlag(key: string, on: boolean, store: Store = globalThis.localStorage): void {
  try {
    store.setItem(key, on ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

export type ValueMomentKind = 'import' | 'firstConnect'

/** One bar at a time. Import wins over the first-connect hint. Welcome / notes / quick start block both. */
export function pickValueMoment(input: {
  importCount: number | null
  firstConnect: boolean
  blocked: boolean
}): ValueMomentKind | null {
  if (input.blocked) return null
  if (input.importCount != null && input.importCount > 0) return 'import'
  if (input.firstConnect) return 'firstConnect'
  return null
}

/** Fresh installs get one hint. Upgrades are stamped seen and stay quiet. */
export function decideFirstConnect(input: { fresh: boolean; off: boolean; seen: boolean }): 'show' | 'stamp' | 'ignore' {
  if (input.off || input.seen) return 'ignore'
  if (!input.fresh) return 'stamp'
  return 'show'
}

/** Hosts the import bar can connect or reveal. Overwrite keeps the existing id; copy/new use the new id. */
export function importedConnectIds(input: {
  beforeIds: readonly string[]
  afterIds: readonly string[]
  policy: 'skip' | 'overwrite' | 'copy'
  conflictIds: readonly string[]
}): string[] {
  const before = new Set(input.beforeIds)
  const added = input.afterIds.filter((id) => !before.has(id))
  const updated = input.policy === 'overwrite' ? input.conflictIds.filter(Boolean) : []
  return [...new Set([...added, ...updated])]
}
