/** PNG-6: import success and the first successful connect. A strip, not an overlay. */

import { PRODUCT_OVERLAY_ORDER, type ProductOverlay } from './overlay-stack'

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

/** One bar at a time. Import wins over the first-connect hint. Any product overlay blocks both. */
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

/** The strip waits while welcome, the update dialog, the tour, or any other product overlay is up. */
export function valueMomentBlockedByProduct(product: ProductOverlay | null): boolean {
  return product != null && (PRODUCT_OVERLAY_ORDER as readonly string[]).includes(product)
}

/** A successful import (added or updated) shows the strip until "不再提示" is stored. */
export function shouldShowImportMoment(input: { count: number; off: boolean }): boolean {
  return input.count > 0 && !input.off
}

export type ValueMomentDismiss = 'never' | 'later'

/**
 * What to persist when the strip closes.
 * Import: only "不再提示" sticks; closing it still allows the next import.
 * First connect: closing it remembers that the one hint was used; "不再提示" also sets the off switch.
 */
export function valueMomentDismissWrites(
  kind: ValueMomentKind,
  how: ValueMomentDismiss
): Array<{ key: string; on: boolean }> {
  if (kind === 'import') {
    return how === 'never' ? [{ key: IMPORT_HINT_OFF_KEY, on: true }] : []
  }
  const writes = [{ key: FIRST_CONNECT_SEEN_KEY, on: true }]
  if (how === 'never') writes.push({ key: FIRST_CONNECT_OFF_KEY, on: true })
  return writes
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
