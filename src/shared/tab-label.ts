/** UX-55 D3: tab strip and the overflow list share this label. Do not render raw `t.title` for workbench tabs. */

export type TabLabelSource = {
  title: string
  status?: string
  view?: string
  auditHost?: string
}

export function tabLabel(
  t: TabLabelSource,
  tr: (key: string, vars?: Record<string, string | number>) => string
): string {
  const session = !t.view || t.view === 'session'
  if (session && t.status === 'connecting') return tr('tab.connecting', { title: t.title })
  if (session && t.status === 'disconnected') return tr('tab.disconnected', { title: t.title })
  if (t.view === 'home') return tr('l7.title')
  if (t.view === 'alert-workbench') return tr('l2.title')
  if (t.view === 'audit') return t.auditHost ? `${tr('l4.auditTitle')} · ${t.auditHost}` : tr('l4.auditTitle')
  return t.title
}
