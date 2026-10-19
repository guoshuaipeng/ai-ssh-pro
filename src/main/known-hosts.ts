import { createHash } from 'node:crypto'
import Store from 'electron-store'
import {
  parseOpenSshKnownHosts,
  planKnownHostsImport,
  type ImportPlanRow
} from '../shared/known-hosts-io'

export type KnownHostEntry = {
  /** host:port */
  hostPort: string
  /** OpenSSH-style SHA256 fingerprint (base64, no padding strip) */
  fingerprint: string
  /** raw host key base64 */
  hostKeyBase64: string
  trustedAt: number
}

type KnownHostsSchema = {
  entries: Record<string, KnownHostEntry>
}

const store = new Store<KnownHostsSchema>({
  name: 'ai-ssh-pro-known-hosts',
  defaults: { entries: {} }
})

export function hostPortKey(host: string, port: number): string {
  return `${host.trim().toLowerCase()}:${port}`
}

/** SHA256 fingerprint matching common OpenSSH display (`SHA256:...`). */
export function fingerprintSha256(hostKey: Buffer): string {
  const b64 = createHash('sha256').update(hostKey).digest('base64')
  return `SHA256:${b64}`
}

export function getKnownHost(host: string, port: number): KnownHostEntry | null {
  const key = hostPortKey(host, port)
  const entries = store.get('entries')
  return entries[key] ?? null
}

export function trustHostKey(host: string, port: number, hostKey: Buffer): KnownHostEntry {
  const key = hostPortKey(host, port)
  const entry: KnownHostEntry = {
    hostPort: key,
    fingerprint: fingerprintSha256(hostKey),
    hostKeyBase64: hostKey.toString('base64'),
    trustedAt: Date.now()
  }
  const entries = { ...store.get('entries'), [key]: entry }
  store.set('entries', entries)
  return entry
}

export function removeKnownHost(host: string, port: number): void {
  const key = hostPortKey(host, port)
  const entries = { ...store.get('entries') }
  delete entries[key]
  store.set('entries', entries)
}

export type HostKeyCheckResult =
  | { status: 'trusted' }
  | { status: 'unknown'; fingerprint: string; hostKey: Buffer }
  | { status: 'changed'; fingerprint: string; previousFingerprint: string; hostKey: Buffer }

export function checkHostKey(host: string, port: number, hostKey: Buffer): HostKeyCheckResult {
  const fp = fingerprintSha256(hostKey)
  const known = getKnownHost(host, port)
  if (!known) {
    return { status: 'unknown', fingerprint: fp, hostKey }
  }
  if (known.hostKeyBase64 === hostKey.toString('base64')) {
    return { status: 'trusted' }
  }
  return {
    status: 'changed',
    fingerprint: fp,
    previousFingerprint: known.fingerprint,
    hostKey
  }
}

export function listKnownHosts(): KnownHostEntry[] {
  const entries = store.get('entries')
  return Object.values(entries).sort((a, b) => a.hostPort.localeCompare(b.hostPort))
}

export function removeKnownHostByKey(hostPort: string): boolean {
  const key = String(hostPort ?? '').trim().toLowerCase()
  if (!key) return false
  const entries = { ...store.get('entries') }
  if (!entries[key]) return false
  delete entries[key]
  store.set('entries', entries)
  return true
}

export function trustHostKeyBase64(host: string, port: number, hostKeyBase64: string): KnownHostEntry {
  return trustHostKey(host, port, Buffer.from(hostKeyBase64, 'base64'))
}

export type KnownHostImportPreviewRow = ImportPlanRow & {
  fingerprint: string
  selectedDefault: boolean
}

export type KnownHostImportPreview = {
  rows: KnownHostImportPreviewRow[]
  skippedHashed: number
  skippedOther: number
  /** Truncated raw lines for hashed host names — never imported. */
  skippedHashedSamples: string[]
  sourcePath?: string
}

export function buildImportPreview(text: string, sourcePath?: string): KnownHostImportPreview {
  const parsed = parseOpenSshKnownHosts(text)
  const existing = listKnownHosts().map((e) => ({
    hostPort: e.hostPort,
    fingerprint: e.fingerprint,
    hostKeyBase64: e.hostKeyBase64
  }))
  const plan = planKnownHostsImport(parsed.entries, existing)
  const rows: KnownHostImportPreviewRow[] = plan.map((row) => {
    let fingerprint: string
    try {
      fingerprint = fingerprintSha256(Buffer.from(row.hostKeyBase64, 'base64'))
    } catch {
      fingerprint = 'SHA256:?'
    }
    return {
      ...row,
      fingerprint,
      selectedDefault: row.action === 'add' || row.action === 'update'
    }
  })
  const hashed = parsed.skipped.filter((s) => s.kind === 'hashed')
  return {
    rows,
    skippedHashed: hashed.length,
    skippedOther: parsed.skipped.filter((s) => s.kind !== 'hashed').length,
    skippedHashedSamples: hashed.slice(0, 8).map((s) => (s.line.length > 96 ? s.line.slice(0, 96) + '…' : s.line)),
    sourcePath
  }
}

export function applyImportRows(
  rows: Array<{ host: string; port: number; hostKeyBase64: string }>
): { ok: number; fail: number } {
  let ok = 0
  let fail = 0
  for (const row of rows) {
    try {
      trustHostKeyBase64(row.host, row.port, row.hostKeyBase64)
      ok += 1
    } catch {
      fail += 1
    }
  }
  return { ok, fail }
}
