/** D85: command-bar Tab completion of remote paths (reads SFTP listings only, never runs anything). */

export type PathTarget = {
  /** text before the token being completed */
  head: string
  /** directory part as typed (kept verbatim), e.g. "src/" or "/etc/" or "~/" */
  typedDir: string
  /** name prefix to match */
  prefix: string
  /** directory to list: absolute, or "~"-relative (home resolved by caller) */
  dir: string
  tilde: boolean
}

const unescape = (s: string) => s.replace(/\\(.)/g, '$1')
export const escapeName = (s: string) => s.replace(/([\s'"\\$`!&;|<>()*?#])/g, '\\$1')

function joinPosix(a: string, b: string): string {
  if (!b) return a || '/'
  if (b.startsWith('/')) return b
  const base = a.endsWith('/') ? a : a + '/'
  return normalizePosix(base + b)
}

function normalizePosix(p: string): string {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return (abs ? '/' : '') + out.join('/')
}

/** Last unescaped-whitespace token; null when the line ends in a space or the token is not path-like. */
export function pathTarget(line: string, cwd: string | null | undefined): PathTarget | null {
  const m = /(?:^|[^\\])(\s)(?!.*[^\\]\s)/.exec(line)
  const start = m ? m.index + m[0].length : 0
  const token = line.slice(start)
  const head = line.slice(0, start)
  if (!token || !head.trim()) return null // first word is the command itself: leave to history
  // only path-like tokens; bare words keep Tab for history suggestions
  if (!/[/]/.test(token) && !token.startsWith('.') && !token.startsWith('~')) return null
  const slash = token.lastIndexOf('/')
  const typedDir = slash >= 0 ? token.slice(0, slash + 1) : ''
  const prefix = unescape(slash >= 0 ? token.slice(slash + 1) : token)
  const rawDir = unescape(typedDir)
  if (rawDir.startsWith('~')) {
    if (rawDir !== '~/' && !rawDir.startsWith('~/')) return null
    return { head, typedDir, prefix, dir: rawDir.slice(2), tilde: true }
  }
  if (token === '~') return null
  if (rawDir.startsWith('/')) return { head, typedDir, prefix, dir: normalizePosix(rawDir) || '/', tilde: false }
  if (!cwd || !cwd.startsWith('/')) return null
  return { head, typedDir, prefix, dir: joinPosix(cwd, rawDir), tilde: false }
}

export function resolveDir(t: PathTarget, home: string | null): string | null {
  if (!t.tilde) return t.dir
  if (!home) return null
  return joinPosix(home, t.dir)
}

function commonPrefix(xs: string[]): string {
  if (!xs.length) return ''
  let p = xs[0]!
  for (const x of xs) while (!x.startsWith(p)) p = p.slice(0, -1)
  return p
}

export type CompleteResult =
  | { kind: 'none' }
  | { kind: 'done'; line: string }
  | { kind: 'partial'; line: string; candidates: string[] }
  | { kind: 'ambiguous'; candidates: string[] }

/** Hidden entries only match when the prefix starts with ".". */
export function completeFrom(t: PathTarget, entries: readonly { name: string; isDirectory: boolean }[]): CompleteResult {
  const hits = entries
    .filter((e) => e.name.startsWith(t.prefix) && (t.prefix.startsWith('.') || !e.name.startsWith('.')))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (!hits.length) return { kind: 'none' }
  if (hits.length === 1) {
    const e = hits[0]!
    return { kind: 'done', line: t.head + t.typedDir + escapeName(e.name) + (e.isDirectory ? '/' : ' ') }
  }
  const names = hits.map((e) => (e.isDirectory ? e.name + '/' : e.name))
  const cp = commonPrefix(hits.map((e) => e.name))
  if (cp.length > t.prefix.length) return { kind: 'partial', line: t.head + t.typedDir + escapeName(cp), candidates: names }
  return { kind: 'ambiguous', candidates: names }
}
