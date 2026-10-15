/** UX-59: pin, close others, close to the right. Home is never the accidental victim. */

export type TabRef = {
  id: string
  view?: string
  pinned?: boolean
  /** Open order. Pinning does not change it. */
  seq: number
}

export function arrangeTabs<T extends TabRef>(tabs: T[]): T[] {
  const pinned = tabs.filter((t) => t.pinned).sort((a, b) => a.seq - b.seq)
  const rest = tabs.filter((t) => !t.pinned).sort((a, b) => a.seq - b.seq)
  return [...pinned, ...rest]
}

export function isHome(tab: TabRef): boolean {
  return tab.view === 'home'
}

/** Keep the current tab, every pinned tab, and the ops home tab. */
export function closeOthers<T extends TabRef>(tabs: T[], currentId: string): string[] {
  const ordered = arrangeTabs(tabs)
  const keep = new Set<string>()
  keep.add(currentId)
  for (const t of ordered) {
    if (t.pinned) keep.add(t.id)
    if (isHome(t)) keep.add(t.id)
  }
  return ordered.filter((t) => !keep.has(t.id)).map((t) => t.id)
}

/**
 * Close unpinned tabs to the right of current.
 * Pinned tabs on the right stay. The home tab stays.
 * Disabled when nothing sits to the right.
 */
export function closeRight<T extends TabRef>(tabs: T[], currentId: string): { close: string[]; disabled: boolean } {
  const ordered = arrangeTabs(tabs)
  const idx = ordered.findIndex((t) => t.id === currentId)
  if (idx < 0 || idx >= ordered.length - 1) return { close: [], disabled: true }
  const right = ordered.slice(idx + 1)
  const close = right.filter((t) => !t.pinned && !isHome(t)).map((t) => t.id)
  return { close, disabled: false }
}

export function withPinned<T extends TabRef>(tabs: T[], id: string, pinned: boolean): T[] {
  return tabs.map((t) => (t.id === id ? { ...t, pinned } : t))
}
