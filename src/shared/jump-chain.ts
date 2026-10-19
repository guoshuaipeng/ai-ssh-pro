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

export type ChainChip = { id: string; label: string; role: 'local' | 'hop' | 'target'; deleted?: boolean; cycle?: boolean }

/** Single-line diagram: this computer → hops → target. */
export function chainDiagram(hops: JumpHop[], targetHost: string, knownProfileIds?: Set<string>): ChainChip[] {
  const chips: ChainChip[] = [{ id: 'local', label: '', role: 'local' }]
  const target = targetHost.trim().toLowerCase()
  hops.slice(0, MAX_HOPS).forEach((hop, i) => {
    const name = hop.label || hop.host || ''
    chips.push({
      id: hop.id || `hop-${i + 1}`,
      label: name,
      role: 'hop',
      deleted: Boolean(hop.profileId && knownProfileIds && !knownProfileIds.has(hop.profileId)),
      cycle: Boolean(target && hop.host.trim().toLowerCase() === target)
    })
  })
  chips.push({ id: 'target', label: targetHost.trim(), role: 'target' })
  return chips
}

export type HopProbeRow = {
  hop: number
  total: number
  name: string
  addr: string
  ok: boolean
  ms: number
  reason?: string
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

export const PROBE_HOST_KEY_DENIED = {
  zh: '主机密钥未信任/已变化，请先正常连接一次确认',
  en: 'Host key is untrusted or changed. Connect normally once to confirm it.'
}

/** Read-only known_hosts gate for 测试连接. Unknown or changed keys must not be authenticated. */
export function probeHostKeyError(status: 'trusted' | 'unknown' | 'changed'): { zh: string; en: string } | null {
  if (status === 'trusted') return null
  return PROBE_HOST_KEY_DENIED
}


export type HopReasonKind = 'auth' | 'timeout' | 'unreachable' | 'refused' | 'dns' | 'generic'

/** Map the raw hop failure reason to a human triage bucket. */
export function classifyHopReason(reason: string): HopReasonKind {
  const s = String(reason ?? '')
  if (/ECONNREFUSED|Connection refused|没有在监听|连接被拒绝|refused/i.test(s)) return 'refused'
  if (/ETIMEDOUT|timed out|handshake|连接超时|超时/i.test(s)) return 'timeout'
  if (/ENOTFOUND|getaddrinfo|找不到主机|Host not found/i.test(s)) return 'dns'
  if (/EHOSTUNREACH|ENETUNREACH|EHOSTDOWN|No route to host|Host is unreachable|主机不可达|无法到达|网络不可达/i.test(s)) {
    return 'unreachable'
  }
  if (/authentication methods failed|All configured authentication|认证失败|密码或密钥|用户名或密钥|Permission denied \(publickey|Permission denied \(password/i.test(s)) {
    return 'auth'
  }
  return 'generic'
}

export function formatHopFailure(hop: number, total: number, name: string, addr: string, reason: string): string {
  return `[hop ${hop}/${total}] ${name} (${addr}): ${reason}`
}

const IPC_PREFIX = /^Error invoking remote method '[^']+':\s*/i
const ERR_PREFIX = /^Error:\s*/i

/** Drop Electron's `Error invoking remote method 'ssh:connect': Error:` wrapper. */
export function stripHopIpcPrefix(message: string): string {
  let s = String(message ?? '').trim()
  for (let i = 0; i < 6; i++) {
    const next = s.replace(IPC_PREFIX, '').replace(ERR_PREFIX, '').trim()
    if (next === s) break
    s = next
  }
  return s
}

export function parseHopFailure(message: string): { hop: number; total: number; name: string; addr: string; reason: string } | null {
  const m = /^\[hop (\d+)\/(\d+)\] (.+) \(([^)]+)\): ([\s\S]+)$/.exec(stripHopIpcPrefix(message))
  if (!m) return null
  return { hop: Number(m[1]), total: Number(m[2]), name: m[3]!, addr: m[4]!, reason: m[5]! }
}

export function profileHasJump(profile: Pick<SavedSessionProfile, 'jumpHost' | 'jumpChain'>): boolean {
  return chainFromProfile(profile).length > 0
}
