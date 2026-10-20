/** UX-50: "last session" restores whitelisted center tabs. Terminal scrollback is not part of the snapshot. */

import type { SavedWorkspaceTab } from './startup-pref'
import { arrangeTabs } from './tab-actions'

export const RESTORE_KINDS = [
  'home',
  'alert-workbench',
  'monitor',
  'toolbox',
  'sftp',
  'forward',
  'inventory',
  'settings',
  'playbook-list',
  'playbook-edit',
  'audit',
  'recordings',
  'sync-settings',
  'terminal'
] as const

const RESTORE_SET = new Set<string>(RESTORE_KINDS)

/** Kinds that need a saved profile. Missing profiles are skipped. */
const PROFILE_KINDS = new Set(['terminal', 'monitor', 'toolbox', 'sftp'])

export function isRestorableKind(kind: string): boolean {
  return RESTORE_SET.has(kind)
}

/** A whitelist row that would still open a finished page. Sync preview is absent: its plan is not in the snapshot. */
export function isCompleteRestoreRow(row: SavedWorkspaceTab): boolean {
  if (!row || typeof row.kind !== 'string' || !isRestorableKind(row.kind)) return false
  if (PROFILE_KINDS.has(row.kind) && !row.profileId) return false
  if (row.kind === 'playbook-edit' && !row.playbookId) return false
  return true
}

export function planRestore(
  saved: SavedWorkspaceTab[],
  knownProfileIds: Set<string>
): { keep: SavedWorkspaceTab[]; skipped: number } {
  const keep: SavedWorkspaceTab[] = []
  let skipped = 0
  const sorted = [...saved].sort((a, b) => a.order - b.order)
  for (const row of sorted) {
    if (!row || typeof row.kind !== 'string' || !isCompleteRestoreRow(row)) {
      if (row && typeof row.kind === 'string') skipped += 1
      continue
    }
    if (PROFILE_KINDS.has(row.kind) && !knownProfileIds.has(row.profileId!)) {
      skipped += 1
      continue
    }
    keep.push(row)
  }
  const active = keep.filter((r) => r.active)
  if (active.length > 1) {
    let seen = false
    for (const row of keep) {
      if (!row.active) continue
      if (seen) row.active = false
      seen = true
    }
  }
  return { keep, skipped }
}

/** Persistable slice of open center tabs. Local shells, scrollback, and unsaved buffers are omitted.
 * Order matches the tab strip (pinned first, then drag/openSeq), so restore keeps visual order.
 */
export function snapshotWorkspace(
  tabs: Array<{
    tabId: string
    view?: string
    kind?: string
    profileId?: string
    title: string
    toolboxTab?: string
    focusAlertId?: string
    settingsSection?: string
    playbookId?: string
    pinned?: boolean
    openSeq?: number
    cwd?: string | null
    draft?: string | null
  }>,
  activeId: string | null
): SavedWorkspaceTab[] {
  const arranged = arrangeTabs(
    tabs.map((t, i) => ({
      ...t,
      id: t.tabId,
      seq: typeof t.openSeq === 'number' ? t.openSeq : (i + 1) * 10,
      pinned: Boolean(t.pinned)
    }))
  )
  const rows: SavedWorkspaceTab[] = []
  arranged.forEach((t, order) => {
    const kind = !t.view || t.view === 'session' ? (t.kind === 'local' ? 'local' : 'terminal') : t.view
    const row: SavedWorkspaceTab = {
      kind,
      profileId: t.profileId,
      title: kind === 'terminal' ? t.title : '',
      order,
      toolboxTab: t.toolboxTab,
      focusAlertId: t.focusAlertId,
      settingsSection: t.settingsSection,
      playbookId: t.playbookId,
      active: t.tabId === activeId,
      pinned: t.pinned ? true : undefined
    }
    if (kind === 'terminal' && t.cwd) row.cwd = t.cwd
    if (kind === 'terminal' && t.draft) row.draft = t.draft
    if (!isCompleteRestoreRow(row)) return
    rows.push(row)
  })
  return rows
}

/** UX-50b: give up auto-binding a monitor/toolbox tab after this long. */
export const RESTORE_BIND_MS = 20_000

/**
 * An explicit empty snapshot is both lists empty. A missing `tabs` array is the
 * pre-0.4.2 shape and must not be treated as "the user closed everything".
 */
export function isExplicitEmptyWorkspace(saved: { profileIds?: string[]; tabs?: unknown }): boolean {
  return Array.isArray(saved.tabs) && saved.tabs.length === 0 && Array.isArray(saved.profileIds) && saved.profileIds.length === 0
}

/**
 * Prefer saved center tabs. When that list is missing or empty, fall back to
 * the legacy profile-id list so a 0.4.1 snapshot still reconnects.
 */
export function workspaceRestoreRows(
  saved: { profileIds: string[]; tabs?: SavedWorkspaceTab[] },
  titleFor: (profileId: string) => string
): SavedWorkspaceTab[] {
  if (saved.tabs && saved.tabs.length > 0) return saved.tabs
  return saved.profileIds.map((id, order) => ({
    kind: 'terminal',
    profileId: id,
    title: titleFor(id),
    order,
    active: order === 0
  }))
}

export const CHANGELOG_RESTORE_SCOPE = {
  zh: '启动「上次会话」现恢复运维首页、告警工作台、SFTP、监控、工具箱等中间标签及分屏布局；终端仅恢复标签并重连，不恢复 scrollback。',
  en: 'Startup “Last session” restores Ops home, the alert workbench, SFTP, monitor, toolbox, and other center tabs. Terminals restore as a tab and reconnect; scrollback is not restored.'
}
