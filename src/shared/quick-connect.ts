/**
 * D13: quick connect from `user@host:port`, `[v6]:port`, or a pasted `ssh …` command (-p -i -J -l, -o Port=/User=).
 * Returns null for anything that does not look like a single target, so normal Ctrl+P search is unaffected.
 */
export type QuickHop = { host: string; port: number; username?: string }
export type QuickTarget = QuickHop & { identity?: string; jump?: QuickHop[] }

const HOST_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?)*$/
const V4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/
const V6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/
const USER_RE = /^[a-zA-Z0-9._][a-zA-Z0-9._-]{0,63}$/

function validPort(s: string): number | null {
  if (!/^\d{1,5}$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= 65535 ? n : null
}

function validHost(h: string): boolean {
  if (V4_RE.test(h)) return h.split('.').every((x) => Number(x) <= 255)
  return HOST_RE.test(h) || V6_RE.test(h)
}

/** `[user@]host[:port]` / `[user@][v6]:port`. `needSignal` rejects bare words (so "nginx" stays a search). */
export function parseHop(raw: string, needSignal = false): QuickHop | null {
  let s = String(raw ?? '').trim()
  if (!s || /\s/.test(s)) return null
  s = s.replace(/^ssh:\/\//i, '').replace(/\/$/, '')
  let username: string | undefined
  const at = s.lastIndexOf('@')
  if (at >= 0) {
    username = s.slice(0, at)
    s = s.slice(at + 1)
    if (!USER_RE.test(username)) return null
  }
  let host = s
  let port = 22
  let hasPort = false
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(s)
  if (v6) {
    host = v6[1]!
    if (v6[2]) {
      const p = validPort(v6[2])
      if (!p) return null
      port = p
      hasPort = true
    }
  } else if ((s.match(/:/g) ?? []).length === 1) {
    const [h, p] = s.split(':') as [string, string]
    const n = validPort(p)
    if (!n) return null
    host = h
    port = n
    hasPort = true
  }
  if (!host || !validHost(host)) return null
  if (needSignal && !username && !hasPort && !V4_RE.test(host) && !host.includes('.') && !v6) return null
  return { host, port, ...(username ? { username } : {}) }
}

function tokenize(s: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

const FLAGS_WITH_ARG = new Set(['-p', '-i', '-J', '-l', '-o', '-F', '-L', '-R', '-D', '-b', '-c', '-E', '-m', '-O', '-Q', '-S', '-W', '-w', '-e', '-I', '-B'])

export function parseQuickTarget(text: string): QuickTarget | null {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!s || s.length > 1000) return null
  if (!/^ssh(\s|$)/.test(s)) return parseHop(s, true)
  const t = tokenize(s).slice(1)
  let port: number | null = null
  let user: string | undefined
  let identity: string | undefined
  let jump: QuickHop[] | undefined
  let dest: string | null = null
  for (let i = 0; i < t.length; i++) {
    const a = t[i]!
    if (a.startsWith('-') && a.length > 1) {
      const flag = a.slice(0, 2)
      let val = a.length > 2 ? a.slice(2) : undefined
      if (FLAGS_WITH_ARG.has(flag)) {
        if (val === undefined) val = t[++i]
        if (val === undefined) return null
      }
      if (flag === '-p') {
        port = validPort(val!)
        if (!port) return null
      } else if (flag === '-l') user = val
      else if (flag === '-i') identity = val
      else if (flag === '-J') {
        if (val === 'none') continue
        const hops = val!.split(',').map((h) => parseHop(h))
        if (hops.some((h) => !h) || hops.length > 5) return null
        jump = hops as QuickHop[]
      } else if (flag === '-o') {
        const m = /^(\w+)\s*=?\s*(.*)$/.exec(val!)
        const k = m?.[1]?.toLowerCase()
        if (k === 'port') {
          port = validPort(m![2]!)
          if (!port) return null
        } else if (k === 'user') user = m![2]
        else if (k === 'identityfile') identity = m![2]
      }
      continue
    }
    if (dest) break // the rest is a remote command
    dest = a
  }
  if (!dest) return null
  const hop = parseHop(dest)
  if (!hop) return null
  const username = hop.username ?? user
  if (username && !USER_RE.test(username)) return null
  return {
    host: hop.host,
    port: port ?? hop.port,
    ...(username ? { username } : {}),
    ...(identity ? { identity } : {}),
    ...(jump ? { jump } : {})
  }
}

export function quickTargetLabel(t: QuickTarget): string {
  const h = t.host.includes(':') ? `[${t.host}]` : t.host
  return `${t.username ? t.username + '@' : ''}${h}${t.port !== 22 ? ':' + t.port : ''}`
}

/** Saved profile for the same user/host/port (user optional on the target). */
export function matchProfile<P extends { host: string; port?: number; username?: string }>(profiles: P[], t: QuickTarget): P | null {
  return (
    profiles.find((p) => p.host === t.host && (p.port || 22) === t.port && (!t.username || p.username === t.username)) ?? null
  )
}
