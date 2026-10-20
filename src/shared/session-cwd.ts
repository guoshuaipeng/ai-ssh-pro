/**
 * D2: remember each session's working directory so a reconnect can return to it.
 * Sources: OSC 7 (`file://host/path`) when the shell emits it, else the common bash prompt `user@host:/path$ `.
 */

const MAX = 1024

function clean(p: string): string | null {
  const s = p.trim()
  if (!s || s.length > MAX || /[\x00-\x1f\x7f]/.test(s)) return null
  if (!(s.startsWith('/') || s === '~' || s.startsWith('~/'))) return null
  return s
}

/** OSC 7 payload, e.g. `file://web-01/var/log%20x` → `/var/log x`. */
export function cwdFromOsc7(data: string): string | null {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(String(data ?? ''))
  if (!m) return null
  try {
    return clean(decodeURIComponent(m[1]!))
  } catch {
    return null
  }
}

/** `root@web-01:/etc/nginx# ` / `demo@host:~/app$ ` → path; `[u@h dir]$` (basename only) is not trusted. */
export function cwdFromPrompt(lineBeforeCursor: string): string | null {
  const m = /(?:^|\s)[\w.-]+@[\w.-]+:(~?\/?[^\s$#]*)[$#]\s?$/.exec(String(lineBeforeCursor ?? ''))
  if (!m) return null
  return clean(m[1]!)
}

/** Shell line that returns to `cwd` (leading space keeps it out of history with HISTCONTROL=ignorespace); null for home. */
export function cdCommandFor(cwd: string | null | undefined): string | null {
  const c = clean(String(cwd ?? ''))
  if (!c || c === '~' || c === '~/') return null
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  if (c.startsWith('~/')) return ` cd -- ~/${q(c.slice(2))}`
  return ` cd -- ${q(c)}`
}
