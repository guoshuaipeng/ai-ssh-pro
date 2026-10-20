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

/** D20b: Windows local prompt `PS C:\x> ` / `C:\x>` → `C:\x` (local sessions only). */
export function cwdFromWinPrompt(lineBeforeCursor: string): string | null {
  const m = /^(?:PS )?([A-Za-z]:\\[^<>"|?*\x00-\x1f]*?)>\s?$/.exec(String(lineBeforeCursor ?? '').trimStart())
  if (!m) return null
  const p = m[1]!
  return p.length > MAX ? null : p
}

/** D20b: start directory for a re-spawned local shell; falls back to home when the path is gone or not absolute. */
export function localStartCwd(requested: string | null | undefined, home: string, isDir: (p: string) => boolean): string {
  let p = String(requested ?? '').trim()
  if (!p || p.length > MAX || /[\x00-\x1f]/.test(p)) return home
  if (p === '~') return home
  if (p.startsWith('~/')) p = home.replace(/[\\/]+$/, '') + p.slice(1)
  if (!(p.startsWith('/') || /^[A-Za-z]:\\/.test(p))) return home
  try {
    return isDir(p) ? p : home
  } catch {
    return home
  }
}

/** Shell line that returns to `cwd` (leading space keeps it out of history with HISTCONTROL=ignorespace); null for home. */
export function cdCommandFor(cwd: string | null | undefined): string | null {
  const c = clean(String(cwd ?? ''))
  if (!c || c === '~' || c === '~/') return null
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
  if (c.startsWith('~/')) return ` cd -- ~/${q(c.slice(2))}`
  return ` cd -- ${q(c)}`
}
