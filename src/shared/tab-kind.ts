import type { IconName } from './icon-registry'

/**
 * UI-N3: tab kinds share one muted icon map. No per-kind hex and no left-bar color.
 * Unknown workspace views fall back to a neutral square, still one token.
 */
const KIND_ICON: Record<string, IconName> = {
  session: 'monitor',
  connection: 'plus',
  inventory: 'file-text',
  sftp: 'folder',
  'remote-file': 'file-text',
  ai: 'sparkles',
  terminalPrefs: 'keyboard',
  uiTheme: 'wand-sparkles',
  snippets: 'clipboard-list',
  docker: 'square',
  mcpGuide: 'book-open',
  monitor: 'activity',
  toolbox: 'wrench',
  forward: 'arrow-left-right',
  batch: 'list-tree',
  dashboard: 'table',
  'inspect-report': 'file-check',
  updates: 'refresh-cw',
  'import-preview': 'file-check',
  'file-diff': 'git-compare',
  home: 'activity',
  'alert-workbench': 'bell',
  audit: 'scroll-text',
  'playbook-list': 'book-open',
  'playbook-edit': 'file-pen',
  'playbook-run': 'play',
  'playbook-result': 'file-check',
  'sync-settings': 'refresh-cw',
  'sync-conflicts': 'git-compare',
  recordings: 'history',
  'recording-play': 'play-circle',
  'sync-preview': 'git-compare',
  settings: 'wrench',
  'file-history': 'history',
  postmortem: 'scroll-text',
  'alert-rules': 'bell',
  'playbook-import': 'file-check',
  'gate-timeline': 'scroll-text',
  'alert-maintenance': 'bell',
  'alert-postmortem-ai': 'sparkles'
}

export function tabKindIcon(view?: string): IconName {
  if (!view || view === 'session') return 'monitor'
  return KIND_ICON[view] ?? 'square'
}
