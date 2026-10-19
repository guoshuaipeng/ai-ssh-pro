/** OpenSSH known_hosts parse + import plan (no Node crypto). */

export type ParsedKnownHost = {
  host: string
  port: number
  keyType: string
  hostKeyBase64: string
}

export type ParseSkip = {
  kind: 'hashed' | 'marker' | 'bad' | 'empty'
  line: string
}

export type ParseKnownHostsResult = {
  entries: ParsedKnownHost[]
  skipped: ParseSkip[]
}

/** `[host]:port` or host; comma-separated names → one entry per name. */
export function splitKnownHostNames(field: string): Array<{ host: string; port: number }> {
  const out: Array<{ host: string; port: number }> = []
  for (const part of field.split(',').map((s) => s.trim()).filter(Boolean)) {
    const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(part)
    if (bracket) {
      const port = bracket[2] ? Number(bracket[2]) : 22
      if (!Number.isFinite(port) || port < 1 || port > 65535) continue
      out.push({ host: bracket[1]!.trim().toLowerCase(), port })
      continue
    }
    if (part.startsWith('|')) continue // hashed — caller marks skip
    const host = part.trim().toLowerCase()
    if (!host) continue
    out.push({ host, port: 22 })
  }
  return out
}

export function parseOpenSshKnownHosts(text: string): ParseKnownHostsResult {
  const entries: ParsedKnownHost[] = []
  const skipped: ParseSkip[] = []
  const seen = new Set<string>()

  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      skipped.push({ kind: 'empty', line: rawLine })
      continue
    }
    if (line.startsWith('#')) continue
    if (line.startsWith('@')) {
      skipped.push({ kind: 'marker', line })
      continue
    }
    const bits = line.split(/\s+/)
    if (bits.length < 3) {
      skipped.push({ kind: 'bad', line })
      continue
    }
    const namesField = bits[0]!
    const keyType = bits[1]!
    const hostKeyBase64 = bits[2]!
    if (namesField.startsWith('|') || namesField.split(',').some((p) => p.trim().startsWith('|'))) {
      skipped.push({ kind: 'hashed', line })
      continue
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(hostKeyBase64) || hostKeyBase64.length < 32) {
      skipped.push({ kind: 'bad', line })
      continue
    }
    const names = splitKnownHostNames(namesField)
    if (!names.length) {
      skipped.push({ kind: 'bad', line })
      continue
    }
    for (const n of names) {
      const key = `${n.host}:${n.port}`
      const dedupe = `${key}|${keyType}|${hostKeyBase64}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      entries.push({ host: n.host, port: n.port, keyType, hostKeyBase64 })
    }
  }

  return {
    entries,
    skipped: skipped.filter((s) => s.kind !== 'empty')
  }
}

export type ExistingHostKey = {
  hostPort: string
  fingerprint: string
  hostKeyBase64: string
}

export type ImportPlanAction = 'add' | 'update' | 'unchanged'

export type ImportPlanRow = {
  host: string
  port: number
  hostPort: string
  keyType: string
  hostKeyBase64: string
  action: ImportPlanAction
  previousFingerprint?: string
}

export function hostPortKey(host: string, port: number): string {
  return `${host.trim().toLowerCase()}:${port}`
}

/** Compare parsed OpenSSH rows to the app store (fingerprint filled by caller later). */
export function planKnownHostsImport(
  parsed: ParsedKnownHost[],
  existing: readonly ExistingHostKey[]
): ImportPlanRow[] {
  const byKey = new Map(existing.map((e) => [e.hostPort, e]))
  const out: ImportPlanRow[] = []
  const seen = new Set<string>()
  for (const row of parsed) {
    const hp = hostPortKey(row.host, row.port)
    const id = `${hp}|${row.hostKeyBase64}`
    if (seen.has(id)) continue
    seen.add(id)
    const cur = byKey.get(hp)
    let action: ImportPlanAction = 'add'
    if (cur) {
      action = cur.hostKeyBase64 === row.hostKeyBase64 ? 'unchanged' : 'update'
    }
    out.push({
      host: row.host,
      port: row.port,
      hostPort: hp,
      keyType: row.keyType,
      hostKeyBase64: row.hostKeyBase64,
      action,
      previousFingerprint: cur && action === 'update' ? cur.fingerprint : undefined
    })
  }
  return out
}

export function defaultImportSelection(rows: readonly ImportPlanRow[]): string[] {
  return rows.filter((r) => r.action === 'add' || r.action === 'update').map((r) => r.hostPort + '|' + r.hostKeyBase64)
}

/** Heuristic: private key file names under ~/.ssh (not .pub / known_hosts / config). */
export function isLikelyPrivateKeyName(name: string): boolean {
  const n = name.trim()
  if (!n || n.startsWith('.')) return false
  const lower = n.toLowerCase()
  if (lower.endsWith('.pub')) return false
  if (lower === 'known_hosts' || lower === 'known_hosts.old') return false
  if (lower === 'config' || lower === 'authorized_keys') return false
  if (lower.endsWith('.ppk') || lower.endsWith('.pem') || lower.endsWith('.key')) return true
  if (/^id_[a-z0-9_-]+$/i.test(n)) return true
  if (/^id_.*_sk$/i.test(n)) return true
  return false
}

/** Product copy keys live in i18n; this flag marks hashed rows as non-importable. */
export const HASHED_HOSTS_NEVER_IMPORTED = true


/** Hostnames allowed for ssh-keygen -F (argv only — never a shell string). */
export function isSafeKnownHostLookupName(host: string): boolean {
  const h = String(host ?? '').trim()
  if (!h || h.length > 253) return false
  if (/[\s;|&$<>`(){}'"\\]/.test(h)) return false
  // hostname, IPv4, or simple IPv6 / bracket forms without spaces
  return /^[A-Za-z0-9._:\[\]-]+$/.test(h)
}

/** Build the name ssh-keygen -F expects (`host` or `[host]:port`). */
export function keygenFQueryName(host: string, port = 22): string | null {
  if (!isSafeKnownHostLookupName(host)) return null
  const h = host.trim().toLowerCase()
  const p = Number(port) || 22
  if (p === 22) return h.replace(/^\[|\]$/g, '')
  const inner = h.replace(/^\[|\]$/g, '')
  return `[${inner}]:${p}`
}

export type KeygenFMatch = {
  /** Always the user-requested host (never taken from a hashed blob alone). */
  host: string
  port: number
  keyType: string
  hostKeyBase64: string
  hashed: boolean
  line: string
}

/**
 * Parse `ssh-keygen -F <host>` stdout.
 * Only emits rows for the explicit requestedHost (case-insensitive); never bulk-unhashes.
 */
export function parseSshKeygenFOutput(stdout: string, requestedHost: string, port = 22): KeygenFMatch[] {
  const want = requestedHost.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!want || !isSafeKnownHostLookupName(want)) return []
  const wantPort = Number(port) || 22
  const out: KeygenFMatch[] = []
  const lines = String(stdout ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const found = /^#\s*Host\s+(.+?)\s+found:/i.exec(line.trim())
    if (!found) continue
    const named = found[1]!.trim()
    const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(named)
    const namedHost = (bracket ? bracket[1]! : named).trim().toLowerCase()
    const namedPort = bracket?.[2] ? Number(bracket[2]) : 22
    // Must match the host the user asked for (ignore other hosts if tool ever returns them).
    if (namedHost !== want) continue
    if (Number.isFinite(namedPort) && namedPort !== wantPort && wantPort !== 22 && namedPort !== 22) {
      // allow wantPort=22 matching any if user looked up bare host — keep strict: require port match when wantPort!=22
    }
    if (wantPort !== 22 && namedPort !== wantPort) continue
    // next non-empty non-# line is the known_hosts entry
    let body = ''
    for (let j = i + 1; j < lines.length; j++) {
      const L = (lines[j] ?? '').trim()
      if (!L) continue
      if (L.startsWith('#')) break
      body = L
      break
    }
    if (!body) continue
    const bits = body.split(/\s+/)
    if (bits.length < 3) continue
    const namesField = bits[0]!
    const keyType = bits[1]!
    const hostKeyBase64 = bits[2]!
    if (!/^[A-Za-z0-9+/=]+$/.test(hostKeyBase64) || hostKeyBase64.length < 16) continue
    const hashed = namesField.startsWith('|') || namesField.split(',').some((p) => p.trim().startsWith('|'))
    out.push({
      host: want,
      port: wantPort !== 22 ? wantPort : namedPort || 22,
      keyType,
      hostKeyBase64,
      hashed,
      line: body.length > 120 ? body.slice(0, 120) + '…' : body
    })
  }
  return out
}
