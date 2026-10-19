/** Format open workspace tabs as plain text (name + host). */
export type OpenTabExportRow = {
  title?: string
  customTitle?: string
  view?: string
  kind?: string
  status?: string
  connectOpts?: { host?: string; port?: number; username?: string; label?: string }
  profileId?: string
}

export function tabExportLabel(t: OpenTabExportRow): string {
  const name = String(t.customTitle || t.title || t.view || t.kind || 'tab').trim() || 'tab'
  return name
}

export function tabExportHost(t: OpenTabExportRow): string {
  const o = t.connectOpts
  if (!o) return ''
  const host = String(o.label || o.host || '').trim()
  if (!host) return ''
  const user = String(o.username || '').trim()
  const port = typeof o.port === 'number' && o.port > 0 && o.port !== 22 ? o.port : null
  let target = host
  if (user) target = `${user}@${host}`
  if (port) target = `${target}:${port}`
  return target
}

/** One line per tab: `title — user@host:port` (host omitted when empty). */
export function formatOpenTabsList(tabs: readonly OpenTabExportRow[]): string {
  return tabs
    .map((t) => {
      const name = tabExportLabel(t)
      const host = tabExportHost(t)
      const status = t.status && t.status !== 'connected' ? ` [${t.status}]` : ''
      return host ? `${name} — ${host}${status}` : `${name}${status}`
    })
    .join('\n')
}
