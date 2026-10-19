/** Pure OpenSSH config → session drafts (preview-safe; no file I/O). */

export type SshConfigDraft = {
  label: string
  host: string
  port: number
  username: string
  privateKeyPath?: string
  jumpHost?: { host: string; port: number; username: string }
  jumpChain?: Array<{
    id: string
    host: string
    port: number
    username: string
    auth?: 'password' | 'key' | 'agent'
  }>
  forwards?: Array<{ localPort: number; remoteHost: string; remotePort: number }>
  group?: string
  authMode?: 'password' | 'key' | 'agent'
  /** Present when OpenSSH ProxyCommand was set; not applied at connect (use ProxyJump). */
  proxyCommand?: string
}

export type SshConfigParseResult = {
  drafts: SshConfigDraft[]
  notes: string[]
  skippedWildcard: number
  includeCount: number
  matchCount: number
  includedFiles?: string[]
  skippedIncludes?: Array<{ path: string; reason: string }>
}

export const SSH_INCLUDE_MAX_DEPTH = 3
export const SSH_INCLUDE_MAX_FILES = 32

type Block = { patterns: string[]; lines: string[] }

function parseBlocks(text: string): { blocks: Block[]; includeCount: number; matchCount: number } {
  const blocks: Block[] = []
  let cur: Block | null = null
  let includeCount = 0
  let matchCount = 0
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? ''
    if (!line) continue
    if (/^Include\s+/i.test(line)) {
      includeCount += 1
      continue
    }
    if (/^Match\s+/i.test(line)) {
      matchCount += 1
      cur = null
      continue
    }
    const hostM = line.match(/^Host\s+(.+)$/i)
    if (hostM) {
      const patterns = hostM[1]!.trim().split(/\s+/).filter(Boolean)
      cur = { patterns, lines: [] }
      blocks.push(cur)
      continue
    }
    if (cur) cur.lines.push(line)
  }
  return { blocks, includeCount, matchCount }
}

function looksLikeHostname(s: string): boolean {
  if (!s || s === '*') return false
  if (s.includes('*') || s.includes('?')) return false
  if (s.startsWith('!')) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true
  if (s.includes('.')) return true
  if (/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s) && s.length >= 1) return true
  return false
}

function parsePort(raw: string | undefined, fallback = 22): number {
  if (raw == null || raw === '') return fallback
  const n = parseInt(String(raw).replace(/\s/g, ''), 10)
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback
}

function stripQuotes(v: string): string {
  const s = v.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1)
  return s
}

/** Collect directive values; IdentityFile keeps first; others last-wins except LocalForward list. */
function collectDirectives(lines: string[]): {
  kv: Record<string, string>
  identityFiles: string[]
  localForwards: string[]
  proxyJump: string
  proxyCommand: string
} {
  const kv: Record<string, string> = {}
  const identityFiles: string[] = []
  const localForwards: string[] = []
  let proxyJump = ''
  let proxyCommand = ''
  for (const ln of lines) {
    const m = ln.match(/^(\S+)\s+(.+)$/)
    if (!m) continue
    const k = m[1]!.toLowerCase()
    const v = stripQuotes(m[2]!)
    if (k === 'identityfile') {
      if (v) identityFiles.push(v)
      continue
    }
    if (k === 'localforward') {
      if (v) localForwards.push(v)
      continue
    }
    if (k === 'proxyjump') {
      proxyJump = v
      continue
    }
    if (k === 'proxycommand') {
      proxyCommand = v
      continue
    }
    kv[k] = v
  }
  return { kv, identityFiles, localForwards, proxyJump, proxyCommand }
}

export function expandTilde(path: string, homeDir: string): string {
  const home = homeDir.replace(/[/\\]+$/, '')
  if (!path) return path
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return home + path.slice(1)
  return path
}

/** `8080 localhost:80` | `127.0.0.1:8080 host:80` | `[::1]:8080 host:80` */
export function parseLocalForward(spec: string): { localPort: number; remoteHost: string; remotePort: number } | null {
  const s = stripQuotes(spec).trim()
  if (!s) return null
  const m = /^(\[([^\]]+)\]|([^:\s]+)):(\d+)\s+(\S+):(\d+)$/.exec(s)
  if (m) {
    const localPort = Number(m[4])
    const remoteHost = m[5]!
    const remotePort = Number(m[6])
    if (localPort > 0 && remotePort > 0) return { localPort, remoteHost, remotePort }
  }
  const m2 = /^(\d+)\s+(\S+):(\d+)$/.exec(s)
  if (m2) {
    const localPort = Number(m2[1])
    const remoteHost = m2[2]!
    const remotePort = Number(m2[3])
    if (localPort > 0 && remotePort > 0) return { localPort, remoteHost, remotePort }
  }
  return null
}

export type ProxyJumpHop = { id: string; host: string; port: number; username: string; auth?: 'key' }

/** Minimal ProxyJump parse (user@host:port,hop2). Full parser may replace in main. */
export function parseProxyJumpLite(text: string): ProxyJumpHop[] {
  const hops: ProxyJumpHop[] = []
  for (const part of text.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^(?:([^@\s]+)@)?([^:\s]+)(?::(\d+))?$/.exec(part)
    if (!m || !m[2]) continue
    const port = m[3] ? Number(m[3]) : 22
    if (!Number.isFinite(port) || port < 1 || port > 65535) continue
    hops.push({
      id: `pj-${hops.length + 1}`,
      host: m[2],
      port,
      username: m[1] || '',
      auth: 'key'
    })
  }
  return hops.slice(0, 5)
}

function concretePatterns(patterns: string[]): string[] {
  return patterns.filter((p) => p && !p.startsWith('!') && p !== '*' && !p.includes('*') && !p.includes('?'))
}

export function parseOpenSshConfig(
  text: string,
  opts?: { homeDir?: string; group?: string }
): SshConfigParseResult {
  const homeDir = opts?.homeDir || ''
  const group = opts?.group ?? 'OpenSSH'
  const { blocks, includeCount, matchCount } = parseBlocks(text)
  const drafts: SshConfigDraft[] = []
  const notes: string[] = []
  let skippedWildcard = 0
  const seen = new Set<string>()

  for (const block of blocks) {
    const aliases = concretePatterns(block.patterns)
    if (!aliases.length) {
      skippedWildcard += 1
      continue
    }
    const { kv, identityFiles, localForwards, proxyJump, proxyCommand } = collectDirectives(block.lines)
    const hostName = (kv.hostname || '').trim()
    const username = (kv.user || '').trim() || 'root'
    const port = parsePort(kv.port)
    let privateKeyPath = identityFiles[0] ? expandTilde(identityFiles[0], homeDir || '~') : undefined
    if (privateKeyPath === '~') privateKeyPath = homeDir || undefined

    const forwards = localForwards
      .map(parseLocalForward)
      .filter((x): x is NonNullable<typeof x> => Boolean(x))

    const hops = proxyJump ? parseProxyJumpLite(proxyJump) : []
    // Fill empty hop usernames with target user (common OpenSSH habit)
    for (const h of hops) {
      if (!h.username) h.username = username
    }

    for (const alias of aliases) {
      const host = hostName || (looksLikeHostname(alias) ? alias : '')
      if (!host) continue
      const label = alias
      const key = `${host}|${port}|${username}|${label}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const draft: SshConfigDraft = {
        label,
        host,
        port,
        username,
        group
      }
      if (privateKeyPath) {
        draft.privateKeyPath = privateKeyPath
        draft.authMode = 'key'
      }
      if (hops.length) {
        draft.jumpChain = hops
        draft.jumpHost = { host: hops[0]!.host, port: hops[0]!.port, username: hops[0]!.username }
      }
      if (forwards.length) draft.forwards = forwards
      if (proxyCommand) draft.proxyCommand = proxyCommand
      drafts.push(draft)
    }
  }

  const proxyCommandHosts = drafts.filter((d) => d.proxyCommand).map((d) => d.label)
  if (proxyCommandHosts.length) {
    const sample = proxyCommandHosts.slice(0, 3).join(', ')
    const more = proxyCommandHosts.length > 3 ? ` +${proxyCommandHosts.length - 3}` : ''
    notes.push(
      `ProxyCommand×${proxyCommandHosts.length} (${sample}${more}) — not applied; use ProxyJump or a bastion hop`
    )
  }
  if (includeCount) notes.push(`Include×${includeCount}`)
  if (matchCount) notes.push(`Match×${matchCount}`)
  if (skippedWildcard) notes.push(`Host*×${skippedWildcard}`)

  return { drafts, notes, skippedWildcard, includeCount, matchCount }
}


/** Split Include args (supports quoted paths). */
export function extractIncludePatterns(line: string): string[] {
  const m = /^Include\s+(.+)$/i.exec(line.trim())
  if (!m) return []
  const raw = m[1]!
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (q) {
      if (ch === q) q = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      q = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (cur) out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}

export function normalizePathKey(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** True if absPath is equal to a root or nested under it. */
export function isPathInsideRoots(absPath: string, roots: string[]): boolean {
  const target = normalizePathKey(absPath)
  for (const root of roots) {
    const r = normalizePathKey(root)
    if (!r) continue
    if (target === r || target.startsWith(r + '/')) return true
  }
  return false
}

/** Basename glob with * and ? only. */
export function matchSimpleGlob(name: string, pattern: string): boolean {
  const esc = [...pattern]
    .map((c) => {
      if (c === '*') return '.*'
      if (c === '?') return '.'
      if ('\.+^${}()|[]'.includes(c)) return '\\' + c
      return c
    })
    .join('')
  return new RegExp('^' + esc + '$', 'i').test(name)
}

export type IncludeExpandIo = {
  homeDir: string
  entryPath: string
  readText: (absPath: string) => string | null
  listNames: (absDir: string) => string[]
  resolve: (...parts: string[]) => string
  dirname: (p: string) => string
  isAbsolute: (p: string) => boolean
}

export type IncludeExpandResult = {
  text: string
  includedFiles: string[]
  skipped: Array<{ path: string; reason: string }>
  includeDirectiveCount: number
}

/**
 * Inline OpenSSH Include directives (max depth SSH_INCLUDE_MAX_DEPTH).
 * Only follows files under ~/.ssh and the entry config directory.
 */
export function expandSshConfigIncludes(
  entryText: string,
  io: IncludeExpandIo,
  opts?: { maxDepth?: number; maxFiles?: number }
): IncludeExpandResult {
  const maxDepth = opts?.maxDepth ?? SSH_INCLUDE_MAX_DEPTH
  const maxFiles = opts?.maxFiles ?? SSH_INCLUDE_MAX_FILES
  const sshDir = io.resolve(io.homeDir, '.ssh')
  const entryDir = io.dirname(io.entryPath)
  const roots = [sshDir, entryDir]
  const visited = new Set<string>([normalizePathKey(io.entryPath)])
  const includedFiles: string[] = []
  const skipped: Array<{ path: string; reason: string }> = []
  let includeDirectiveCount = 0
  let filesOpened = 0

  function resolvePattern(pattern: string, fromDir: string): string[] {
    const expanded = expandTilde(stripQuotes(pattern), io.homeDir)
    const abs = io.isAbsolute(expanded) ? expanded : io.resolve(fromDir, expanded)
    const norm = abs.replace(/\\/g, '/')
    const base = norm.split('/').pop() || ''
    const parent = io.dirname(abs)
    if (base.includes('*') || base.includes('?')) {
      return io
        .listNames(parent)
        .filter((n) => matchSimpleGlob(n, base))
        .map((n) => io.resolve(parent, n))
    }
    return [abs]
  }

  function expand(text: string, fromPath: string, depth: number): string {
    const fromDir = io.dirname(fromPath)
    const out: string[] = []
    for (const rawLine of String(text ?? '').split(/\r?\n/)) {
      const trimmed = rawLine.split('#')[0]?.trim() ?? ''
      if (!/^Include\s+/i.test(trimmed)) {
        out.push(rawLine)
        continue
      }
      includeDirectiveCount += 1
      if (depth >= maxDepth) {
        skipped.push({ path: trimmed, reason: 'depth' })
        out.push('# skipped Include (max depth): ' + trimmed)
        continue
      }
      for (const pat of extractIncludePatterns(trimmed)) {
        let targets: string[] = []
        try {
          targets = resolvePattern(pat, fromDir)
        } catch {
          skipped.push({ path: pat, reason: 'bad' })
          continue
        }
        if (!targets.length) {
          skipped.push({ path: pat, reason: 'missing' })
          continue
        }
        for (const target of targets) {
          const key = normalizePathKey(target)
          if (visited.has(key)) {
            skipped.push({ path: target, reason: 'cycle' })
            continue
          }
          if (!isPathInsideRoots(target, roots)) {
            skipped.push({ path: target, reason: 'outside' })
            continue
          }
          if (filesOpened >= maxFiles) {
            skipped.push({ path: target, reason: 'limit' })
            continue
          }
          const body = io.readText(target)
          if (body == null) {
            skipped.push({ path: target, reason: 'missing' })
            continue
          }
          visited.add(key)
          filesOpened += 1
          includedFiles.push(target)
          out.push('# begin Include ' + target)
          out.push(expand(body, target, depth + 1))
          out.push('# end Include ' + target)
        }
      }
    }
    return out.join('\n')
  }

  return {
    text: expand(entryText, io.entryPath, 0),
    includedFiles,
    skipped,
    includeDirectiveCount
  }
}
