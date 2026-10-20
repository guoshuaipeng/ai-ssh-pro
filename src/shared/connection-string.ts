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

/** D84: a runnable OpenSSH command for a host. Never includes passwords or passphrases. */
export function formatSshCommand(o: {
  host: string
  port?: number
  username: string
  privateKeyPath?: string
  authMode?: 'password' | 'key' | 'agent'
  jumpHost?: { host: string; port?: number; username: string }
  jumpChain?: { host: string; port?: number; username: string }[]
}): string {
  const q = (s: string) => (/^[A-Za-z0-9_@%+=:,./~\-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)
  const hop = (h: { host: string; port?: number; username: string }) => `${h.username}@${h.host}${h.port && h.port !== 22 ? `:${h.port}` : ''}`
  const parts = ['ssh']
  if (o.port && o.port !== 22) parts.push('-p', String(o.port))
  if (o.privateKeyPath?.trim() && o.authMode !== 'password' && o.authMode !== 'agent') parts.push('-i', q(o.privateKeyPath.trim()))
  const hops = o.jumpChain?.length ? o.jumpChain : o.jumpHost?.host ? [o.jumpHost] : []
  if (hops.length) parts.push('-J', hops.map(hop).join(','))
  parts.push(`${o.username.trim()}@${o.host.trim()}`)
  return parts.join(' ')
}

/** Short host/label for the status-bar chip. */
export function statusHostChipLabel(raw: string | undefined | null, max = 24): string | null {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const lim = Number.isFinite(max) && max > 4 ? Math.floor(max) : 24
  return s.length > lim ? `${s.slice(0, lim - 1)}…` : s
}
