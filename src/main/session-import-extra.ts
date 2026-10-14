import type { ImportedSessionDraft } from '../shared/ipc'

/**
 * MobaXterm bookmarks export (.mxtsessions / MobaXterm.ini).
 * Lines in [Bookmarks*] look like:  name=#109#0%host%22%user%...   (109 = SSH)
 * SubRep=folder path is used as a label prefix.
 */
export function parseMobaXtermSessions(text: string): ImportedSessionDraft[] {
  const out: ImportedSessionDraft[] = []
  let inBookmarks = false
  let folder = ''
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';')) continue
    const sec = /^\[(.+)\]$/.exec(line)
    if (sec) {
      inBookmarks = /^bookmarks/i.test(sec[1]!)
      folder = ''
      continue
    }
    if (!inBookmarks) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (/^subrep$/i.test(key)) {
      folder = value.replace(/\\/g, '/').trim()
      continue
    }
    if (/^imgnum$/i.test(key)) continue
    const parts = value.split('#')
    if (parts.length < 3 || parts[1] !== '109') continue
    const f = parts[2]!.split('%')
    const host = (f[1] ?? '').trim()
    const port = Number.parseInt(f[2] ?? '', 10)
    const username = (f[3] ?? '').trim()
    if (!host || !username) continue
    const name = key.replace(/^\s*\*\s*/, '').trim() || `${username}@${host}`
    out.push({
      label: (folder ? `${folder}/${name}` : name).slice(0, 80),
      host,
      port: port > 0 && port < 65536 ? port : 22,
      username
    })
  }
  return out
}

/**
 * SecureCRT session .ini (one session per file):
 *   S:"Hostname"=10.0.0.1   S:"Username"=root   D:"[SSH2] Port"=00000016 (hex)   S:"Protocol Name"=SSH2
 */
export function parseSecureCrtSession(label: string, text: string): ImportedSessionDraft | null {
  const kv = new Map<string, string>()
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*([SDB]):"([^"]+)"=(.*)$/.exec(raw)
    if (m) kv.set(`${m[1]}:${m[2]!.toLowerCase()}`, m[3]!.trim())
  }
  const proto = kv.get('S:protocol name') ?? 'SSH2'
  if (!/^ssh/i.test(proto)) return null
  const host = kv.get('S:hostname') ?? ''
  const username = kv.get('S:username') ?? ''
  if (!host || !username) return null
  const hex = kv.get('D:[ssh2] port') ?? kv.get('D:port')
  const port = hex ? Number.parseInt(hex, 16) : 22
  return { label: label.slice(0, 80) || `${username}@${host}`, host, port: port > 0 && port < 65536 ? port : 22, username }
}

export function looksLikeMobaXterm(text: string): boolean {
  return /^\s*\[bookmarks/im.test(text) && /#109#/.test(text)
}

export function looksLikeSecureCrt(text: string): boolean {
  return /^\s*S:"Hostname"=/im.test(text)
}
