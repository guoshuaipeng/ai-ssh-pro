/** PNG-4: what a cold start should open from the saved workspace. */

import { isExplicitEmptyWorkspace, planRestore, workspaceRestoreRows } from './session-restore'
import type { LastWorkspace, SavedWorkspaceTab, StartupMode } from './startup-pref'

export type ColdStartPlan =
  | { kind: 'blank' }
  | { kind: 'home'; skipped: number; empty: boolean }
  | { kind: 'restore'; tabs: SavedWorkspaceTab[]; activeIndex: number; skipped: number }

export function planColdStart(opts: {
  mode: StartupMode
  saved: LastWorkspace
  knownProfileIds: Set<string>
  titleFor?: (profileId: string) => string
}): ColdStartPlan {
  if (opts.mode === 'blank') return { kind: 'blank' }
  if (opts.mode !== 'last') return { kind: 'home', skipped: 0, empty: false }
  const source = workspaceRestoreRows(opts.saved, opts.titleFor ?? ((id) => id))
  const planned = planRestore(source, opts.knownProfileIds)
  const empty = isExplicitEmptyWorkspace(opts.saved)
  if (!planned.keep.length) return { kind: 'home', skipped: planned.skipped, empty }
  const activeIndex = Math.max(0, planned.keep.findIndex((row) => row.active))
  return { kind: 'restore', tabs: planned.keep, activeIndex, skipped: planned.skipped }
}

const WATCH_VIEWS = new Set(['monitor', 'toolbox', 'sftp'])

/**
 * Only the active tab that is actually restoring may hit the 20s give-up.
 * A neighbor that has not started connecting is left alone.
 */
export function restoreWatchIds(
  tabs: Array<{ tabId: string; view?: string; cold?: boolean; boundSessionId?: string; restoreFailed?: boolean }>,
  activeId: string | null
): string[] {
  if (!activeId) return []
  return tabs
    .filter(
      (t) =>
        t.tabId === activeId &&
        Boolean(t.view && WATCH_VIEWS.has(t.view)) &&
        t.cold === true &&
        !t.boundSessionId &&
        !t.restoreFailed
    )
    .map((t) => t.tabId)
}
