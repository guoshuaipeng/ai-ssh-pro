/** OpenSSH user-certificate card data and sk-ed25519 detection. sk keys connect through an agent. */

export type KeyKind = 'ed25519' | 'sk-ed25519' | 'rsa' | 'ecdsa' | 'unknown'

export type CertTone = 'ok' | 'soon' | 'expired' | 'principal' | 'unknown'

export type CertInfo = {
  found: boolean
  type?: string
  validUntil?: number
  validAfter?: number
  principals: string[]
  daysLeft?: number
  tone: CertTone
  keyId?: string
}

export function detectKeyMaterial(text: string): KeyKind {
  if (/sk-ssh-ed25519@openssh\.com|sk-ed25519/.test(text)) return 'sk-ed25519'
  if (/ssh-ed25519-cert|ssh-ed25519\b/.test(text)) return 'ed25519'
  if (/ssh-rsa-cert|ssh-rsa\b|BEGIN RSA/.test(text)) return 'rsa'
  if (/ecdsa-sha2-|BEGIN EC/.test(text)) return 'ecdsa'
  return 'unknown'
}

export function skNeedsAgent(kind: KeyKind, authMode: 'password' | 'key' | 'agent'): boolean {
  return kind === 'sk-ed25519' && authMode !== 'agent'
}

export type CertCardState =
  | { code: 'none' }
  | { code: 'ok'; date: string; user: string }
  | { code: 'soon'; days: number; date: string }
  | { code: 'expired'; date: string }
  | { code: 'principal'; user: string }
  | { code: 'unknown' }

export function certCardState(info: CertInfo, username = ''): CertCardState {
  if (!info.found) return { code: 'none' }
  const date = info.validUntil ? new Date(info.validUntil).toISOString().slice(0, 10) : ''
  const user = info.principals[0] || username || info.keyId || ''
  if (info.tone === 'expired') return { code: 'expired', date }
  if (info.tone === 'soon') return { code: 'soon', days: Math.max(0, info.daysLeft ?? 0), date }
  if (info.tone === 'principal') return { code: 'principal', user }
  if (info.tone === 'unknown') return { code: 'unknown' }
  return { code: 'ok', date, user }
}

export function siblingCertPath(keyPath: string): string {
  return keyPath.replace(/\.pub$/i, '') + '-cert.pub'
}

function u32(buf: Uint8Array, offset: number): number {
  return buf[offset]! * 16777216 + buf[offset + 1]! * 65536 + buf[offset + 2]! * 256 + buf[offset + 3]!
}

function readString(buf: Uint8Array, offset: number): { value: Uint8Array; offset: number } | null {
  if (offset + 4 > buf.length) return null
  const len = u32(buf, offset)
  const start = offset + 4
  if (len < 0 || start + len > buf.length) return null
  return { value: buf.subarray(start, start + len), offset: start + len }
}

function readU64(buf: Uint8Array, offset: number): { value: number; offset: number } | null {
  if (offset + 8 > buf.length) return null
  const hi = u32(buf, offset)
  const lo = u32(buf, offset + 4)
  return { value: hi * 2 ** 32 + lo, offset: offset + 8 }
}

function readU32(buf: Uint8Array, offset: number): { value: number; offset: number } | null {
  if (offset + 4 > buf.length) return null
  return { value: u32(buf, offset), offset: offset + 4 }
}

function readPrincipals(buf: Uint8Array): string[] {
  const names: string[] = []
  let offset = 0
  const dec = new TextDecoder()
  while (offset + 4 <= buf.length) {
    const s = readString(buf, offset)
    if (!s) break
    names.push(dec.decode(s.value))
    offset = s.offset
  }
  return names
}

function b64decode(s: string): Uint8Array | null {
  try {
    const bin = globalThis.atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/** Parse an OpenSSH certificate public line or the raw cert blob. */
export function parseCertificate(text: string, username: string, now = Date.now()): CertInfo {
  const empty: CertInfo = { found: false, principals: [], tone: 'unknown' }
  const line = text.split(/\n/).find((l) => /-cert-v0[01]@openssh\.com/.test(l)) || text.trim()
  const m = line.match(/^(\S+)\s+([A-Za-z0-9+/=]+)/)
  if (!m) return empty
  const blob = b64decode(m[2]!)
  if (!blob) return empty
  let offset = 0
  const type = readString(blob, offset)
  if (!type)   return { found: true, principals: [], tone: 'unknown', type: m[1] }
  offset = type.offset
  const typeName = new TextDecoder().decode(type.value)
  const nonce = readString(blob, offset)
  if (!nonce) return { found: true, principals: [], tone: 'unknown', type: typeName }
  offset = nonce.offset
  if (typeName.startsWith('ssh-ed25519') || typeName.startsWith('sk-ssh-ed25519')) {
    const pk = readString(blob, offset)
    if (!pk) return { found: true, principals: [], tone: 'unknown', type: typeName }
    offset = pk.offset
    if (typeName.startsWith('sk-')) {
      const app = readString(blob, offset)
      if (!app) return { found: true, principals: [], tone: 'unknown', type: typeName }
      offset = app.offset
    }
  } else if (typeName.startsWith('ssh-rsa')) {
    const e = readString(blob, offset)
    if (!e) return { found: true, principals: [], tone: 'unknown', type: typeName }
    const n = readString(blob, e.offset)
    if (!n) return { found: true, principals: [], tone: 'unknown', type: typeName }
    offset = n.offset
  } else if (typeName.startsWith('ecdsa-')) {
    const curve = readString(blob, offset)
    if (!curve) return { found: true, principals: [], tone: 'unknown', type: typeName }
    const pk = readString(blob, curve.offset)
    if (!pk) return { found: true, principals: [], tone: 'unknown', type: typeName }
    offset = pk.offset
  } else {
    return { found: true, principals: [], tone: 'unknown', type: typeName }
  }
  const serial = readU64(blob, offset)
  if (!serial) return { found: true, principals: [], tone: 'unknown', type: typeName }
  const certType = readU32(blob, serial.offset)
  if (!certType) return { found: true, principals: [], tone: 'unknown', type: typeName }
  const keyId = readString(blob, certType.offset)
  if (!keyId) return { found: true, principals: [], tone: 'unknown', type: typeName }
  const keyIdText = new TextDecoder().decode(keyId.value)
  const principalsBuf = readString(blob, keyId.offset)
  if (!principalsBuf) return { found: true, principals: [], tone: 'unknown', type: typeName }
  const principals = readPrincipals(principalsBuf.value)
  const after = readU64(blob, principalsBuf.offset)
  const before = after ? readU64(blob, after.offset) : null
  if (!after || !before) return { found: true, principals, tone: 'unknown', type: typeName, keyId: keyIdText }
  const validUntil = before.value * 1000
  const daysLeft = Math.ceil((validUntil - now) / 86_400_000)
  let tone: CertTone = 'ok'
  if (daysLeft < 0) tone = 'expired'
  else if (daysLeft <= 7) tone = 'soon'
  else if (username && principals.length && !principals.includes(username)) tone = 'principal'
  return {
    found: true,
    type: typeName,
    validUntil,
    validAfter: after.value * 1000,
    principals,
    daysLeft,
    tone,
    keyId: keyIdText
  }
}

function bytesOf(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function pushU32(parts: Uint8Array[], n: number): void {
  parts.push(Uint8Array.of((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255))
}

function pushStr(parts: Uint8Array[], data: Uint8Array): void {
  pushU32(parts, data.length)
  parts.push(data)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function b64encode(data: Uint8Array): string {
  let bin = ''
  for (const b of data) bin += String.fromCharCode(b)
  return globalThis.btoa(bin)
}

/** Build a minimal ed25519 user certificate line for tests and the card parser. */
export function buildEd25519Cert(opts: { principals: string[]; validAfter: number; validBefore: number; keyId?: string }): string {
  const parts: Uint8Array[] = []
  const u64 = (n: number) => {
    const hi = Math.floor(n / 2 ** 32)
    const lo = n >>> 0
    pushU32(parts, hi)
    pushU32(parts, lo)
  }
  pushStr(parts, bytesOf('ssh-ed25519-cert-v01@openssh.com'))
  pushStr(parts, new Uint8Array(16).fill(1))
  pushStr(parts, new Uint8Array(32).fill(2))
  u64(1)
  pushU32(parts, 1)
  pushStr(parts, bytesOf(opts.keyId || 'ops'))
  const principalParts: Uint8Array[] = []
  for (const p of opts.principals) pushStr(principalParts, bytesOf(p))
  pushStr(parts, concat(principalParts))
  u64(opts.validAfter)
  u64(opts.validBefore)
  pushStr(parts, new Uint8Array())
  pushStr(parts, new Uint8Array())
  pushStr(parts, new Uint8Array())
  pushStr(parts, bytesOf('ssh-ed25519'))
  pushStr(parts, new Uint8Array(8).fill(3))
  return `ssh-ed25519-cert-v01@openssh.com ${b64encode(concat(parts))} ops`
}
