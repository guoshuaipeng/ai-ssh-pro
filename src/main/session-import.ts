import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { looksLikeFinalShell, looksLikeMobaXterm, looksLikeSecureCrt, parseFinalShell, parseMobaXtermSessions, parseSecureCrtSession } from './session-import-extra'
import { redactSecrets } from '../shared/import-preview'
import { parseProxyJump } from '../shared/jump-chain'
import { parseOpenSshConfig } from '../shared/ssh-config-import'
import { loadAndParseSshConfigFile } from './ssh-config-load'
import { homedir } from 'node:os'
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

function parseSshConfig(text: string): { drafts: ImportedSessionDraft[]; notes: string[] } {
  const home = homedir()
  const parsed = parseOpenSshConfig(text, { homeDir: home, group: 'OpenSSH' })
  const drafts: ImportedSessionDraft[] = []
  for (const d of parsed.drafts) {
    const draft: ImportedSessionDraft = {
      label: d.label,
      host: d.host,
      port: d.port,
      username: d.username,
      group: d.group
    }
    if (d.privateKeyPath) {
      draft.privateKeyPath = d.privateKeyPath
      draft.authMode = 'key'
    }
    if (d.forwards?.length) draft.forwards = d.forwards
    if (d.jumpChain?.length) {
      const rebuilt = d.jumpChain
        .map((h) => `${h.username ? h.username + '@' : ''}${h.host}${h.port && h.port !== 22 ? ':' + h.port : ''}`)
        .join(',')
      const hops = parseProxyJump(rebuilt).hops
      if (hops.length) {
        draft.jumpChain = hops
        draft.jumpHost = {
          host: hops[0]!.host,
          port: hops[0]!.port,
          username: hops[0]!.username
        }
      } else {
        draft.jumpChain = d.jumpChain as ImportedSessionDraft['jumpChain']
        draft.jumpHost = d.jumpHost
      }
    }
    drafts.push(draft)
  }
  const notes: string[] = [...parsed.notes]
  const proxyN = parsed.drafts.filter((d) => d.proxyCommand).length
  if (proxyN && !notes.some((n) => /ProxyCommand/i.test(n))) {
    notes.push(`OpenSSH ProxyCommand×${proxyN}（未应用连接；请改用 ProxyJump / 跳板）`)
  }
  if (parsed.includeCount && !notes.some((n) => /Include/i.test(n))) {
    notes.push(`OpenSSH Include×${parsed.includeCount}`)
  }
  if (parsed.matchCount && !notes.some((n) => /Match/i.test(n))) {
    notes.push(`OpenSSH Match×${parsed.matchCount}（暂不导入）`)
  }
  if (parsed.skippedWildcard && !notes.some((n) => /通配|Host\*/.test(n))) {
    notes.push(`跳过 ${parsed.skippedWildcard} 个通配 Host`)
  }
  return { drafts, notes }
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

function decodePuttySessionName(encoded: string): string {
  try {
    return decodeURIComponent(encoded.replace(/\+/g, '%20'))
  } catch {
    return encoded
  }
}

function parseRegQuotedString(raw: string): string {
  const t = raw.trim()
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t
      .slice(1, -1)
      .replace(/\\([\\"])/g, '$1')
      .replace(/\\r/g, '\r')
      .replace(/\\n/g, '\n')
  }
  return t
}

function parseRegDword(raw: string): number | null {
  const t = raw.trim()
  const hex = t.match(/^dword:([0-9a-fA-F]+)$/i)
  if (hex) {
    const n = parseInt(hex[1]!, 16)
    return Number.isFinite(n) ? n : null
  }
  const n = parseInt(t.replace(/^"|"$/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function unwrapQuoted(v: string): string {
  const t = v.trim()
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1)
  }
  return t
}

function draftFromPuttyFields(
  label: string,
  fields: Record<string, string>,
  notes: string[],
  sourceHint: string
): ImportedSessionDraft | null {
  const protocol = unwrapQuoted(fields.Protocol || fields.protocol || '').trim().toLowerCase()
  if (protocol && protocol !== 'ssh') {
    notes.push(`${sourceHint}「${label}」：跳过非 SSH 协议（${protocol}）`)
    return null
  }

  const host = unwrapQuoted(fields.HostName || fields.hostname || fields.Host || '').trim()
  if (!host) {
    notes.push(`${sourceHint}「${label}」：缺少 HostName`)
    return null
  }

  const username = unwrapQuoted(fields.UserName || fields.username || fields.User || '').trim() || 'root'
  let port = 22
  const portRaw = fields.PortNumber || fields.Port || fields.port
  if (portRaw != null && String(portRaw).trim() !== '') {
    const dword = parseRegDword(String(portRaw))
    if (dword != null && dword > 0 && dword < 65536) port = dword
    else port = parsePort(unwrapQuoted(String(portRaw)))
  }

  const draft: ImportedSessionDraft = {
    label: label.trim() || host,
    host,
    port,
    username
  }

  const publicKey = unwrapQuoted(
    fields.PublicKeyFile || fields.publickeyfile || fields.IdentityFile || ''
  ).trim()
  if (publicKey) {
    if (/\.ppk$/i.test(publicKey)) {
      notes.push(
        `${sourceHint}「${label}」：检测到 .ppk 私钥路径，未导入（请转换为 OpenSSH 格式后手动指定）`
      )
    } else {
      draft.privateKeyPath = publicKey
    }
  }

  return draft
}

/** 解析 PuTTY .reg 导出（Sessions 下各会话键） */
function parsePuttyReg(text: string, sourceHint: string): {
  drafts: ImportedSessionDraft[]
  notes: string[]
} {
  const drafts: ImportedSessionDraft[] = []
  const notes: string[] = []
  let label: string | null = null
  let fields: Record<string, string> = {}

  const flush = (): void => {
    if (label == null) return
    const draft = draftFromPuttyFields(label, fields, notes, sourceHint)
    if (draft) drafts.push(draft)
    label = null
    fields = {}
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';')) continue

    const keyM = line.match(/^\[(?:-|)?HKEY_[^\]]*\\PuTTY\\Sessions\\([^\]]+)\]$/i)
    if (keyM) {
      flush()
      const encoded = keyM[1]!.trim()
      const decoded = decodePuttySessionName(encoded)
      if (/^Default Settings$/i.test(decoded)) {
        label = null
        fields = {}
        continue
      }
      label = decoded
      fields = {}
      continue
    }

    if (label == null) continue
    const vm = line.match(/^"([^"]+)"\s*=\s*(.*)$/)
    if (!vm) continue
    const name = vm[1]!
    const rawVal = vm[2]!.trim()
    if (/^dword:/i.test(rawVal)) {
      fields[name] = rawVal
    } else {
      fields[name] = parseRegQuotedString(rawVal)
    }
  }
  flush()
  return { drafts, notes }
}

/** 单文件 PuTTY 会话（INI / key=value，含 HostName + Protocol） */
function parsePuttySessionFile(
  filePath: string,
  text: string,
  notes: string[]
): ImportedSessionDraft | null {
  const kv = parseIniLikeLines(text)
  const label = basename(filePath, extname(filePath))
  return draftFromPuttyFields(label, kv, notes, basename(filePath))
}

function looksLikePuttyReg(text: string): boolean {
  return /\\PuTTY\\Sessions\\/i.test(text) || (/Windows Registry Editor/i.test(text) && /PuTTY/i.test(text))
}

function looksLikePuttySessionText(text: string): boolean {
  const hasHost = /^\s*(?:"HostName"|HostName)\s*=/im.test(text)
  const hasProto = /^\s*(?:"Protocol"|Protocol)\s*=/im.test(text)
  return hasHost && hasProto
}

function isLikelyPuttySessionFilename(filePath: string): boolean {
  const name = basename(filePath).toLowerCase()
  const ext = extname(filePath).toLowerCase()
  if (ext === '.reg') return true
  if (name.includes('putty')) return true
  return false
}

export async function importSessionFilesFromPaths(filePaths: string[]): Promise<SessionImportPickResult> {
  const notes: string[] = []
  const items: ImportedSessionDraft[] = []

  for (const fp of filePaths) {
    const ext = extname(fp).toLowerCase()
    const base = basename(fp)
    try {
      const buf = await readFile(fp)
      const text = decodeTextFile(buf)

      if (ext === '.mxtsessions' || looksLikeMobaXterm(text)) {
        const drafts = parseMobaXtermSessions(text)
        if (drafts.length) {
          items.push(...drafts)
          notes.push(`${base}：自 MobaXterm 书签解析 ${drafts.length} 条`)
        } else {
          notes.push(`${base}：未解析到 MobaXterm SSH 书签`)
        }
        continue
      }

      if (ext === '.json' || looksLikeFinalShell(text)) {
        const drafts = parseFinalShell(text)
        if (drafts.length) {
          items.push(...drafts)
          notes.push(`${base}：自 FinalShell 解析 ${drafts.length} 条`)
          continue
        }
        if (ext === '.json' || looksLikeFinalShell(text)) {
          notes.push(`${base}：未解析到 FinalShell SSH 连接`)
          continue
        }
      }

      if (looksLikeSecureCrt(text)) {
        const one = parseSecureCrtSession(basename(fp, extname(fp)), text)
        if (one) {
          items.push(one)
          notes.push(`${base}：自 SecureCRT 会话解析 1 条`)
        } else {
          notes.push(`${base}：SecureCRT 会话未识别到 SSH 主机 / 用户名`)
        }
        continue
      }

      if (ext === '.xsh') {
        const one = parseXshFile(fp, text)
        if (one) items.push(one)
        else notes.push(`${base}：未识别到 Host / 用户名`)
        continue
      }

      if (ext === '.reg' || looksLikePuttyReg(text)) {
        const { drafts, notes: puttyNotes } = parsePuttyReg(text, base)
        notes.push(...puttyNotes)
        if (drafts.length > 0) {
          items.push(...drafts)
          notes.push(`${base}：自 PuTTY 注册表导出解析 ${drafts.length} 条`)
        } else {
          notes.push(`${base}：未解析到有效 PuTTY SSH 会话`)
        }
        continue
      }

      if (looksLikePuttySessionText(text) || (isLikelyPuttySessionFilename(fp) && /\bHostName\s*=/i.test(text))) {
        const one = parsePuttySessionFile(fp, text, notes)
        if (one) {
          items.push(one)
          notes.push(`${base}：自 PuTTY 会话文件解析 1 条`)
          continue
        }
        // 明确像 PuTTY（含 Protocol）则不再回退；仅文件名启发式失败时继续试 SSH config
        if (looksLikePuttySessionText(text)) {
          if (!notes.some((n) => n.includes(base))) {
            notes.push(`${base}：PuTTY 会话未识别到有效 SSH HostName`)
          }
          continue
        }
      }

      // Prefer path-based load so Include can resolve relative to the file.
      const fromSsh = loadAndParseSshConfigFile(fp)
      if (fromSsh.drafts.length > 0) {
        items.push(...fromSsh.drafts.map((d) => {
          const draft: ImportedSessionDraft = {
            label: d.label,
            host: d.host,
            port: d.port,
            username: d.username,
            group: d.group
          }
          if (d.privateKeyPath) {
            draft.privateKeyPath = d.privateKeyPath
            draft.authMode = 'key'
          }
          if (d.forwards?.length) draft.forwards = d.forwards
          if (d.jumpChain?.length) {
            const rebuilt = d.jumpChain
              .map((h) => `${h.username ? h.username + '@' : ''}${h.host}${h.port && h.port !== 22 ? ':' + h.port : ''}`)
              .join(',')
            const hops = parseProxyJump(rebuilt).hops
            if (hops.length) {
              draft.jumpChain = hops
              draft.jumpHost = { host: hops[0]!.host, port: hops[0]!.port, username: hops[0]!.username }
            } else {
              draft.jumpChain = d.jumpChain as ImportedSessionDraft['jumpChain']
              draft.jumpHost = d.jumpHost
            }
          }
          return draft
        }))
        notes.push(`${base}：自 OpenSSH 配置解析 ${fromSsh.drafts.length} 条`)
        notes.push(...fromSsh.expandNotes)
        if (fromSsh.matchCount) notes.push(`OpenSSH Match×${fromSsh.matchCount}（暂不导入）`)
        if (fromSsh.skippedWildcard) notes.push(`跳过 ${fromSsh.skippedWildcard} 个通配 Host`)
        continue
      }
      if (ext === '.config' || base.toLowerCase() === 'config') {
        notes.push(`${base}：未解析到有效 Host 块`)
        continue
      }
      notes.push(`${base}：非 .xsh / PuTTY，且未识别为 SSH config（需含 Host … 块）`)
    } catch (e) {
      notes.push(`${base}：读取失败 ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const merged = mergeDraftsUnique(items)
  if (merged.length < items.length) {
    notes.push(`已去除同主机/端口/用户/标签的重复项 ${items.length - merged.length} 条`)
  }

  return { items: merged, notes: notes.map((n) => redactSecrets(n)) }
}
