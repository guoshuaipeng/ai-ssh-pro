import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { ImportedSessionDraft, SessionImportPickResult } from '../shared/ipc'

function decodeTextFile(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.slice(2).toString('utf16le')
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.alloc(buf.length - 2)
    for (let i = 2; i < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1] ?? 0
      swapped[i - 1] = buf[i] ?? 0
    }
    return swapped.toString('utf16le')
  }
  const head = buf.subarray(0, Math.min(400, buf.length))
  const zeroCount = head.reduce((n, b) => n + (b === 0 ? 1 : 0), 0)
  if (zeroCount > head.length * 0.2) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '')
  }
  return buf.toString('utf8').replace(/^\uFEFF/, '')
}

/** 宽松解析 INI 风格 key=value（Xshell .xsh 等） */
function parseIniLikeLines(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[#;].*$/, '').trim()
    if (!line) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (key) out[key] = val
  }
  return out
}

function parsePort(raw: string | undefined, fallback = 22): number {
  if (raw == null || raw === '') return fallback
  const n = parseInt(String(raw).replace(/\s/g, ''), 10)
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback
}

function parseXshFile(filePath: string, text: string): ImportedSessionDraft | null {
  const kv = parseIniLikeLines(text)
  const host =
    kv.Host ||
    kv.host ||
    kv.HOST ||
    kv.Address ||
    kv['Connection Host'] ||
    kv.RemoteHost ||
    kv.HostName
  const port = parsePort(kv.Port || kv.PortNumber || kv.port || kv.PORT)
  const username =
    kv.UserName || kv.User || kv.username || kv.USER || kv.LoginName || kv['Connection User']
  if (!host?.trim() || !username?.trim()) return null
  const labelFromFile = basename(filePath, extname(filePath))
  const label = (kv.Name || kv.SessionName || kv.Label || labelFromFile).trim() || labelFromFile
  return {
    label: String(label),
    host: host.trim(),
    port,
    username: username.trim()
  }
}

type SshConfigBlock = { patterns: string[]; lines: string[] }

function parseSshConfigBlocks(text: string): SshConfigBlock[] {
  const blocks: SshConfigBlock[] = []
  let cur: SshConfigBlock | null = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? ''
    if (!line) continue
    const hostM = line.match(/^Host\s+(.+)$/i)
    if (hostM) {
      const patterns = hostM[1]!.trim().split(/\s+/).filter(Boolean)
      cur = { patterns, lines: [] }
      blocks.push(cur)
      continue
    }
    if (cur) cur.lines.push(line)
  }
  return blocks
}

function looksLikeHostname(s: string): boolean {
  if (!s || s === '*') return false
  if (s.includes('*') || s.includes('?')) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return true
  if (s.includes('.')) return true
  if (/^[a-zA-Z0-9-]+$/.test(s) && s.length > 2) return true
  return false
}

function parseSshConfig(text: string): ImportedSessionDraft[] {
  const out: ImportedSessionDraft[] = []
  for (const block of parseSshConfigBlocks(text)) {
    const patterns = block.patterns
    if (patterns.length === 0) continue
    if (patterns.every((p) => p === '*' || p === '!*')) continue
    const kv: Record<string, string> = {}
    for (const ln of block.lines) {
      const m = ln.match(/^(\S+)\s+(.+)$/)
      if (!m) continue
      const k = m[1]!.toLowerCase()
      let v = m[2]!.trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      kv[k] = v
    }
    const hostName = kv.hostname || kv.host || ''
    const label = patterns[0]!.trim()
    const hostCandidate = hostName.trim() || patterns.find((p) => looksLikeHostname(p)) || ''
    if (!hostCandidate) continue
    const username = (kv.user || '').trim() || 'root'
    const port = parsePort(kv.port)
    const privateKeyPath = (kv.identityfile || '').trim()
    const draft: ImportedSessionDraft = {
      label,
      host: hostCandidate,
      port,
      username
    }
    if (privateKeyPath) draft.privateKeyPath = privateKeyPath.replace(/^~(?=\/|\\)/, process.env.HOME ?? process.env.USERPROFILE ?? '~')
    out.push(draft)
  }
  return out
}

function mergeDraftsUnique(drafts: ImportedSessionDraft[]): ImportedSessionDraft[] {
  const seen = new Set<string>()
  const out: ImportedSessionDraft[] = []
  for (const d of drafts) {
    const key = `${d.host}|${d.port}|${d.username}|${d.label}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(d)
  }
  return out
}

export async function importSessionFilesFromPaths(filePaths: string[]): Promise<SessionImportPickResult> {
  const notes: string[] = []
  const items: ImportedSessionDraft[] = []

  for (const fp of filePaths) {
    const ext = extname(fp).toLowerCase()
    try {
      const buf = await readFile(fp)
      const text = decodeTextFile(buf)
      if (ext === '.xsh') {
        const one = parseXshFile(fp, text)
        if (one) items.push(one)
        else notes.push(`${basename(fp)}：未识别到 Host / 用户名`)
        continue
      }
      const fromSsh = parseSshConfig(text)
      if (fromSsh.length > 0) {
        items.push(...fromSsh)
        notes.push(`${basename(fp)}：自 OpenSSH 配置解析 ${fromSsh.length} 条`)
        continue
      }
      if (ext === '.config' || basename(fp).toLowerCase() === 'config') {
        notes.push(`${basename(fp)}：未解析到有效 Host 块`)
        continue
      }
      notes.push(`${basename(fp)}：非 .xsh 且未识别为 SSH config（需含 Host … 块）`)
    } catch (e) {
      notes.push(`${basename(fp)}：读取失败 ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const merged = mergeDraftsUnique(items)
  if (merged.length < items.length) {
    notes.push(`已去除同主机/端口/用户/标签的重复项 ${items.length - merged.length} 条`)
  }

  return { items: merged, notes }
}
