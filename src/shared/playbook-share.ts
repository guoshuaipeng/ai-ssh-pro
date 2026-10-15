/** W5: encrypted playbook share packs. Host secrets never enter the file. */
import { redactAuditText } from './audit-log'
import { normalizePlaybook, type Playbook, type PlaybookStep, type PlaybookVar } from './playbook'

export const SHARE_FORMAT = 'aiss-playbooks'
export const SHARE_VERSION = 1
export const SHARE_EXT = '.aiss-playbooks'
export const SHARE_ITERATIONS = 80_000

export type ShareConflict = 'skip' | 'overwrite' | 'duplicate'

export type ShareHostHint = { title: string; tags?: string[] }

export type SharePlaybook = {
  id: string
  name: string
  description?: string
  steps: PlaybookStep[]
  varsDefaults?: PlaybookVar[]
  tags?: string[]
  origin?: { kind: 'alert' | 'error' | 'diff'; ruleId?: string }
  draft?: boolean
}

export type SharePlain = {
  format: typeof SHARE_FORMAT
  version: 1
  exportedAt: string
  appVersion: string
  playbooks: SharePlaybook[]
  hostHints: ShareHostHint[]
}

export type ShareErrorCode = 'bad-format' | 'bad-pass' | 'need-newer' | 'empty' | 'secret-field'

const SECRET_KEYS = new Set([
  'password',
  'passwd',
  'passphrase',
  'privatekey',
  'token',
  'certpem',
  'agentforward',
  'secret',
  'bearer',
  'authorization'
])

function keyName(raw: string): string {
  return raw.toLowerCase().replace(/[_\-\s]/g, '')
}

function scrubText(value: string): string {
  return redactAuditText(value).replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, '[redacted]')
}

export function assertNoSecretKeys(json: string): void {
  const keys = json.match(/"([^"]+)"\s*:/g) ?? []
  for (const token of keys) {
    const name = keyName(token.slice(1, token.indexOf('"', 1)))
    if (SECRET_KEYS.has(name)) throw Object.assign(new Error('secret-field'), { code: 'secret-field' as const })
  }
}

function stepOf(raw: PlaybookStep): PlaybookStep {
  return {
    id: raw.id,
    type: raw.type,
    command: raw.command ? scrubText(raw.command) : raw.command,
    snippetId: raw.snippetId,
    confirm: raw.confirm,
    stopOnError: raw.stopOnError,
    timeoutSec: raw.timeoutSec,
    title: raw.title ? scrubText(raw.title) : undefined
  }
}

function varsOf(vars: PlaybookVar[] | undefined): PlaybookVar[] | undefined {
  if (!vars?.length) return undefined
  return vars.map((v) => ({
    name: v.name,
    label: v.label,
    defaultValue: v.sensitive ? undefined : v.defaultValue ? scrubText(v.defaultValue) : undefined,
    required: v.required,
    sensitive: v.sensitive,
    quote: v.quote
  }))
}

export function buildSharePlain(
  playbooks: Playbook[],
  hostHints: Array<ShareHostHint & Record<string, unknown>>,
  appVersion: string,
  now = new Date()
): SharePlain {
  const plain: SharePlain = {
    format: SHARE_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    appVersion,
    playbooks: playbooks.map((p) => {
      const row: SharePlaybook = {
        id: p.id,
        name: p.name,
        description: p.description ? scrubText(p.description) : undefined,
        steps: p.steps.map(stepOf),
        varsDefaults: varsOf(p.vars),
        draft: p.draft || undefined,
        origin: p.origin ? { kind: p.origin.kind, ruleId: p.origin.ruleId } : undefined
      }
      return row
    }),
    hostHints: hostHints.map((h) => ({
      title: h.title,
      tags: Array.isArray(h.tags) ? h.tags.filter((t): t is string => typeof t === 'string') : undefined
    }))
  }
  assertNoSecretKeys(JSON.stringify(plain))
  return plain
}

type Envelope = {
  magic: 'AISSPB'
  format: typeof SHARE_FORMAT
  version: number
  encrypted: boolean
  kdf?: 'pbkdf2-sha256'
  iterations?: number
  salt?: string
  iv?: string
  data?: string
  payload?: SharePlain
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function deriveKey(pass: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: asBuffer(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encodeSharePack(plain: SharePlain, passphrase: string): Promise<string> {
  assertNoSecretKeys(JSON.stringify(plain))
  if (!passphrase) {
    const open: Envelope = { magic: 'AISSPB', format: SHARE_FORMAT, version: SHARE_VERSION, encrypted: false, payload: plain }
    return JSON.stringify(open)
  }
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, SHARE_ITERATIONS)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(plain)))
  const env: Envelope = {
    magic: 'AISSPB',
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    encrypted: true,
    kdf: 'pbkdf2-sha256',
    iterations: SHARE_ITERATIONS,
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(cipher))
  }
  return JSON.stringify(env)
}

function fail(code: ShareErrorCode): never {
  throw Object.assign(new Error(code), { code })
}

export async function decodeSharePack(raw: string, passphrase: string): Promise<{ plain: SharePlain; encrypted: boolean }> {
  let env: Envelope
  try {
    env = JSON.parse(raw) as Envelope
  } catch {
    fail('bad-format')
  }
  if (!env || env.magic !== 'AISSPB' || env.format !== SHARE_FORMAT) fail('bad-format')
  if (typeof env.version === 'number' && env.version > SHARE_VERSION) fail('need-newer')
  if (env.version !== SHARE_VERSION) fail('bad-format')
  if (!env.encrypted) {
    if (!env.payload || env.payload.format !== SHARE_FORMAT) fail('bad-format')
    assertNoSecretKeys(JSON.stringify(env.payload))
    return { plain: env.payload, encrypted: false }
  }
  if (!passphrase) fail('bad-pass')
  try {
    const iterations = env.iterations ?? SHARE_ITERATIONS
    if (!env.salt || !env.iv || !env.data || iterations < 1 || iterations > 2_000_000) fail('bad-format')
    const key = await deriveKey(passphrase, b64ToBytes(env.salt), iterations)
    const iv = b64ToBytes(env.iv)
    const data = b64ToBytes(env.data)
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: asBuffer(iv) }, key, asBuffer(data))
    const plain = JSON.parse(new TextDecoder().decode(plainBuf)) as SharePlain
    if (!plain || plain.format !== SHARE_FORMAT || !Array.isArray(plain.playbooks)) fail('bad-format')
    assertNoSecretKeys(JSON.stringify(plain))
    return { plain, encrypted: true }
  } catch (err) {
    const code = (err as { code?: ShareErrorCode }).code
    if (code === 'bad-format' || code === 'need-newer' || code === 'secret-field') throw err
    fail('bad-pass')
  }
}

export type SharePreviewRow = {
  name: string
  steps: number
  status: 'import' | 'skip' | 'overwrite' | 'duplicate'
  nextName: string
  draft?: boolean
}

function takenName(names: Set<string>, base: string, suffix: string): string {
  if (!names.has(base)) return base
  const first = `${base}${suffix}`
  if (!names.has(first)) return first
  let n = 2
  while (names.has(`${base}${suffix} ${n}`)) n += 1
  return `${base}${suffix} ${n}`
}

export function previewShareImport(
  existing: Array<{ name: string }>,
  incoming: SharePlaybook[],
  policy: ShareConflict,
  suffix: string
): SharePreviewRow[] {
  const names = new Set(existing.map((p) => p.name.trim()))
  const planned = new Set(names)
  return incoming.map((row) => {
    const name = row.name.trim()
    const conflict = names.has(name)
    if (!conflict) {
      planned.add(name)
      return { name, steps: row.steps.length, status: 'import' as const, nextName: name, draft: row.draft }
    }
    if (policy === 'skip') return { name, steps: row.steps.length, status: 'skip' as const, nextName: name, draft: row.draft }
    if (policy === 'overwrite') return { name, steps: row.steps.length, status: 'overwrite' as const, nextName: name, draft: row.draft }
    const nextName = takenName(planned, name, suffix)
    planned.add(nextName)
    return { name, steps: row.steps.length, status: 'duplicate' as const, nextName, draft: row.draft }
  })
}

export function shareToPlaybook(row: SharePlaybook, name: string, now: number): Playbook | null {
  return normalizePlaybook({
    id: `pb-${now}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: row.description ?? '',
    steps: row.steps,
    vars: row.varsDefaults,
    draft: row.draft,
    updatedAt: now,
    origin: row.origin ? { kind: row.origin.kind, hostKey: '', hostTitle: '', ruleId: row.origin.ruleId, at: now } : undefined
  })
}

/** Apply a preview. Does not connect, run, or attach credentials. */
export function applyShareImport(
  existing: Playbook[],
  incoming: SharePlaybook[],
  policy: ShareConflict,
  suffix: string,
  now = Date.now()
): { list: Playbook[]; written: number; skipped: number } {
  const preview = previewShareImport(existing, incoming, policy, suffix)
  let list = existing.slice()
  let written = 0
  let skipped = 0
  preview.forEach((row, index) => {
    const src = incoming[index]
    if (!src || row.status === 'skip') {
      skipped += 1
      return
    }
    const playbook = shareToPlaybook(src, row.nextName, now + index)
    if (!playbook) {
      skipped += 1
      return
    }
    if (row.status === 'overwrite') {
      const at = list.findIndex((p) => p.name.trim() === row.name.trim())
      if (at >= 0) {
        playbook.id = list[at]!.id
        list = list.slice()
        list[at] = playbook
      } else list = [playbook, ...list]
    } else {
      list = [playbook, ...list]
    }
    written += 1
  })
  return { list, written, skipped }
}

export function defaultShareName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `playbooks-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${SHARE_EXT}`
}
