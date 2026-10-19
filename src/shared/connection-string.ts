/** Format user@host:port for clipboard / status copy. */
export function formatConnectionString(input: {
  username?: string | null
  host?: string | null
  port?: number | null
}): string {
  const user = String(input.username ?? '').trim() || 'root'
  const host = String(input.host ?? '').trim() || 'host'
  const port = typeof input.port === 'number' && input.port > 0 ? input.port : 22
  return `${user}@${host}:${port}`
}

/** Short host/label for the status-bar chip. */
export function statusHostChipLabel(raw: string | undefined | null, max = 24): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const lim = Number.isFinite(max) && max > 4 ? Math.floor(max) : 24
  return s.length > lim ? `${s.slice(0, lim - 1)}…` : s
}
