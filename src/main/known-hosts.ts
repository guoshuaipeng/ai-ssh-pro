import { createHash } from 'node:crypto'
import Store from 'electron-store'

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
