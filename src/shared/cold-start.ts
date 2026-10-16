/** PNG-4: what a cold start should open from the saved workspace. */

import { isExplicitEmptyWorkspace, planRestore, workspaceRestoreRows } from './session-restore'
import type { LastWorkspace, SavedWorkspaceTab, StartupMode } from './startup-pref'
import { shouldShowWelcome } from './welcome-prefs'

export type ColdStartPlan =
  | { kind: 'blank'; autoConnect: false }
  | { kind: 'home'; skipped: number; empty: boolean; autoConnect: false }
  | { kind: 'restore'; tabs: SavedWorkspaceTab[]; activeIndex: number; skipped: number; autoConnect: boolean }

/**
 * Explicit 「上次会话」 reconnects. The default restore (home + 恢复上次布局)
 * reopens tabs and does not open SSH by itself.
 */
export function restoreAutoConnect(mode: StartupMode, restoreLayout?: boolean): boolean {
  if (mode !== 'last') return false
  if (restoreLayout === false) return false
  return true
}

export function planColdStart(opts: {
  mode: StartupMode
  saved: LastWorkspace
  knownProfileIds: Set<string>
  titleFor?: (profileId: string) => string
  /**
   * When true, restore even if startup mode is home.
   * When false, never restore.
   * Omitted keeps the older mode-only rule (only `last` restores).
   */
  restoreLayout?: boolean
}): ColdStartPlan {
  if (opts.mode === 'blank') return { kind: 'blank', autoConnect: false }
  const restore = opts.restoreLayout === true || (opts.restoreLayout == null && opts.mode === 'last')
  if (!restore) return { kind: 'home', skipped: 0, empty: false, autoConnect: false }
  const source = workspaceRestoreRows(opts.saved, opts.titleFor ?? ((id) => id))
  const planned = planRestore(source, opts.knownProfileIds)
  const empty = isExplicitEmptyWorkspace(opts.saved)
  const autoConnect = restoreAutoConnect(opts.mode, opts.restoreLayout)
  if (!planned.keep.length) return { kind: 'home', skipped: planned.skipped, empty, autoConnect: false }
  const activeIndex = Math.max(0, planned.keep.findIndex((row) => row.active))
  return { kind: 'restore', tabs: planned.keep, activeIndex, skipped: planned.skipped, autoConnect }
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

/**
 * Welcome stays down until the host list is known, and stays down when hosts
 * already exist. Release notes, the tour, and quick start still win the overlay slot.
 * Help → 重新欢迎 (`replay`) can open it again.
 */
export function coldStartShowsWelcome(input: {
  sessionsReady: boolean
  bootNoted: boolean
  hostCount: number
  dismissed: boolean
  completed: boolean
  releaseNotesOpen: boolean
  notesHeld: boolean
  replay: boolean
  workspaceBlocked?: boolean
  tourOpen?: boolean
  quickOpen?: boolean
}): boolean {
  if (!input.bootNoted || !input.sessionsReady || input.workspaceBlocked) return false
  return shouldShowWelcome({
    hostCount: input.hostCount,
    dismissed: input.dismissed,
    completed: input.completed,
    releaseNotesOpen: input.releaseNotesOpen,
    notesHeld: input.notesHeld,
    replay: input.replay,
    tourOpen: input.tourOpen,
    quickOpen: input.quickOpen
  })
}

/** A restored session that has not connected this launch. Not a dropped connection. */
export function isQuiescentRestore(tab: {
  view?: string
  restored?: boolean
  sessionId?: string
  cold?: boolean
} | null | undefined): boolean {
  if (!tab?.restored || tab.sessionId || tab.cold === true) return false
  if (tab.view && tab.view !== 'session') return false
  return true
}

/** Calm placeholder instead of a half-drawn tool or a fake terminal. */
export function showsRestoreHold(tab: {
  view?: string
  boundSessionId?: string
  cold?: boolean
  restored?: boolean
  restoreFailed?: boolean
  sessionId?: string
}): boolean {
  if (tab.view === 'monitor' || tab.view === 'toolbox') return !tab.boundSessionId
  if (tab.view === 'sftp') {
    return !tab.boundSessionId && (tab.cold === true || tab.restored === true || tab.restoreFailed === true)
  }
  if (tab.restored && !tab.sessionId && (!tab.view || tab.view === 'session')) return true
  return false
}

/** Status bar and the drop banner. A never-connected restore is not a drop. */
export function showsDroppedConnection(tab: {
  view?: string
  kind?: string
  status?: string
  sessionId?: string
  restored?: boolean
} | null | undefined): boolean {
  if (!tab || tab.kind === 'local') return false
  if (tab.view && tab.view !== 'session') return false
  if (tab.status !== 'disconnected') return false
  if (tab.restored && !tab.sessionId) return false
  return true
}

/** Tab strip, status bar, and title bar leave a usable main pane at 1366×768. */
export const RESTORED_CHROME = { tabStrip: 36, statusBar: 24, titlebar: 40 } as const

export function restoredLayoutFrame(width: number, height: number): { fits: boolean; contentHeight: number } {
  const contentHeight = height - RESTORED_CHROME.tabStrip - RESTORED_CHROME.statusBar - RESTORED_CHROME.titlebar
  return { fits: width === 1366 && height === 768 && contentHeight >= 480, contentHeight }
}
