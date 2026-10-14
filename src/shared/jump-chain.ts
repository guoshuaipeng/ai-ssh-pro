/** L6 / X6: up to five ProxyJump hops, migration from a single jumpHost, and failure text. */
import type { SavedSessionProfile, SshJumpHostOptions } from './ipc'

export const MAX_HOPS = 5

export type HopAuth = 'password' | 'key' | 'agent'

export type JumpHop = {
  id: string
  profileId?: string
  label?: string
  host: string
  port: number
  username: string
  password?: string
  privateKeyPath?: string
  passphrase?: string
  auth?: HopAuth
}

export type ChainIssue =
  | { hop: number; code: 'deleted' }
  | { hop: number; code: 'cycle' }
  | { hop: number; code: 'empty' }
  | { code: 'too-many' }

export function chainFromLegacy(jump: SshJumpHostOptions | undefined | null, id = 'hop-1'): JumpHop[] {
  if (!jump?.host?.trim() || !jump.username?.trim()) return []
  return [
    {
      id,
      host: jump.host.trim(),
      port: jump.port && jump.port > 0 ? jump.port : 22,
      username: jump.username.trim(),
      password: jump.password,
      privateKeyPath: jump.privateKeyPath,
      passphrase: jump.passphrase,
      auth: jump.privateKeyPath ? 'key' : jump.password ? 'password' : 'key'
    }
  ]
}

export function chainFromProfile(profile: { jumpChain?: JumpHop[] | null; jumpHost?: SshJumpHostOptions | null }): JumpHop[] {
  if (Array.isArray(profile.jumpChain) && profile.jumpChain.length) return profile.jumpChain.slice(0, MAX_HOPS).map(normalizeHop).filter((h): h is JumpHop => Boolean(h))
  return chainFromLegacy(profile.jumpHost)
}

function normalizeHop(raw: unknown): JumpHop | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<JumpHop>
  if (typeof o.host !== 'string' || !o.host.trim()) return null
  if (typeof o.username !== 'string' || !o.username.trim()) return null
  const port = typeof o.port === 'number' && o.port > 0 ? o.port : 22
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `hop-${o.host}`,
    profileId: typeof o.profileId === 'string' ? o.profileId : undefined,
    label: typeof o.label === 'string' ? o.label : undefined,
    host: o.host.trim(),
    port,
    username: o.username.trim(),
    password: o.password,
    privateKeyPath: o.privateKeyPath,
    passphrase: o.passphrase,
    auth: o.auth === 'agent' || o.auth === 'password' || o.auth === 'key' ? o.auth : undefined
  }
}

export function hopToJump(hop: JumpHop): SshJumpHostOptions {
  return {
    host: hop.host,
    port: hop.port,
    username: hop.username,
    password: hop.password,
    privateKeyPath: hop.privateKeyPath,
    passphrase: hop.passphrase
  }
}

export type ParsedProxy = { hops: JumpHop[]; bad: string[] }

/** OpenSSH ProxyJump: user@host:port,user2@host2 */
export function parseProxyJump(text: string): ParsedProxy {
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean)
  const hops: JumpHop[] = []
  const bad: string[] = []
  for (const part of parts) {
    const m = part.match(/^(?:([^@\s]+)@)?([^:\s]+)(?::(\d+))?$/)
    if (!m || !m[2]) {
      bad.push(part)
      continue
    }
    const port = m[3] ? Number(m[3]) : 22
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      bad.push(part)
      continue
    }
    hops.push({
      id: `pj-${hops.length + 1}`,
      host: m[2],
      port,
      username: m[1] || '',
      auth: 'key'
    })
  }
  return { hops: hops.slice(0, MAX_HOPS), bad }
}

export function formatProxyJump(hops: JumpHop[]): string {
  return hops
    .map((h) => {
      const port = h.port && h.port !== 22 ? `:${h.port}` : ''
      return `${h.username}@${h.host}${port}`
    })
    .join(',')
}

export function chainTooltip(hops: JumpHop[]): string {
  return hops.map((h) => h.label || h.host).join(' → ')
}

export function validateChain(hops: JumpHop[], targetHost: string, knownProfileIds: Set<string>): ChainIssue[] {
  const issues: ChainIssue[] = []
  if (hops.length > MAX_HOPS) issues.push({ code: 'too-many' })
  const target = targetHost.trim().toLowerCase()
  hops.slice(0, MAX_HOPS).forEach((hop, i) => {
    if (!hop.host.trim() || !hop.username.trim()) issues.push({ hop: i + 1, code: 'empty' })
    if (target && hop.host.trim().toLowerCase() === target) issues.push({ hop: i + 1, code: 'cycle' })
    if (hop.profileId && !knownProfileIds.has(hop.profileId)) issues.push({ hop: i + 1, code: 'deleted' })
  })
  return issues
}

export function canAddHop(hops: JumpHop[]): boolean {
  return hops.length < MAX_HOPS
}

export function formatHopFailure(hop: number, total: number, name: string, addr: string, reason: string): string {
  return `[hop ${hop}/${total}] ${name} (${addr}): ${reason}`
}

export function parseHopFailure(message: string): { hop: number; total: number; name: string; addr: string; reason: string } | null {
  const m = /^\[hop (\d+)\/(\d+)\] (.+) \(([^)]+)\): ([\s\S]+)$/.exec(message.trim())
  if (!m) return null
  return { hop: Number(m[1]), total: Number(m[2]), name: m[3]!, addr: m[4]!, reason: m[5]! }
}

export function profileHasJump(profile: Pick<SavedSessionProfile, 'jumpHost' | 'jumpChain'>): boolean {
  return chainFromProfile(profile).length > 0
}
