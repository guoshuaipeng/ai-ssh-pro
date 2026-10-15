/** UX-50: "last session" restores whitelisted center tabs. Terminal scrollback is not part of the snapshot. */

import type { SavedWorkspaceTab } from './startup-pref'

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
  'sync-preview',
  'terminal'
] as const

const RESTORE_SET = new Set<string>(RESTORE_KINDS)

/** Kinds that need a saved profile. Missing profiles are skipped. */
const PROFILE_KINDS = new Set(['terminal', 'monitor', 'toolbox', 'sftp'])

export function isRestorableKind(kind: string): boolean {
  return RESTORE_SET.has(kind)
}

export function planRestore(
  saved: SavedWorkspaceTab[],
  knownProfileIds: Set<string>
): { keep: SavedWorkspaceTab[]; skipped: number } {
  const keep: SavedWorkspaceTab[] = []
  let skipped = 0
  const sorted = [...saved].sort((a, b) => a.order - b.order)
  for (const row of sorted) {
    if (!row || typeof row.kind !== 'string' || !isRestorableKind(row.kind)) {
      if (row && typeof row.kind === 'string') skipped += 1
      continue
    }
    if (PROFILE_KINDS.has(row.kind)) {
      if (!row.profileId || !knownProfileIds.has(row.profileId)) {
        skipped += 1
        continue
      }
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

/** Persistable slice of open center tabs. Local shells, scrollback, and unsaved buffers are omitted. */
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
  }>,
  activeId: string | null
): SavedWorkspaceTab[] {
  const rows: SavedWorkspaceTab[] = []
  tabs.forEach((t, order) => {
    const kind = !t.view || t.view === 'session' ? (t.kind === 'local' ? 'local' : 'terminal') : t.view
    if (!isRestorableKind(kind)) return
    rows.push({
      kind,
      profileId: t.profileId,
      title: kind === 'terminal' ? t.title : '',
      order,
      toolboxTab: t.toolboxTab,
      focusAlertId: t.focusAlertId,
      settingsSection: t.settingsSection,
      playbookId: t.playbookId,
      active: t.tabId === activeId
    })
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
