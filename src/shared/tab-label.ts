/** UX-55 D3: tab strip and the overflow list share this label. Do not render raw `t.title` for workbench tabs. */

export type TabLabelSource = {
  title: string
  status?: string
  view?: string
  auditHost?: string
}

const VIEW_TITLE: Record<string, string> = {
  home: 'l7.title',
  'alert-workbench': 'l2.title',
  settings: 'menu.settings',
  monitor: 'menu.resourceMonitor',
  toolbox: 'menu.serverTools',
  sftp: 'menu.sftp',
  forward: 'menu.portForward',
  inventory: 'menu.inventory',
  'playbook-list': 'm2.playbooks',
  'playbook-edit': 'm2.edit',
  'playbook-run': 'm2.run',
  'playbook-result': 'm2.playbooks',
  recordings: 'm2.recordings',
  'recording-play': 'm2.play',
  'sync-settings': 'm2.cloudSync',
  'sync-conflicts': 'm2.conflicts',
  'sync-preview': 'm2.syncPreview',
  batch: 'batch.title',
  dashboard: 'o1.title'
}

export function tabLabel(
  t: TabLabelSource,
  tr: (key: string, vars?: Record<string, string | number>) => string
): string {
  const session = !t.view || t.view === 'session'
  if (session && t.status === 'connecting') return tr('tab.connecting', { title: t.title })
  if (session && t.status === 'disconnected') return tr('tab.disconnected', { title: t.title })
  if (t.view === 'audit') return t.auditHost ? `${tr('l4.auditTitle')} · ${t.auditHost}` : tr('l4.auditTitle')
  const key = t.view ? VIEW_TITLE[t.view] : undefined
  if (key) return tr(key)
  return t.title
}
