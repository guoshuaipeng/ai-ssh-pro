/** D41: turn a terminal selection into a remote path for the SFTP panel. */

function normalizePosix(p: string): string {
  const abs = p.startsWith('/')
  const out: string[] = []
  for (const part of p.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!abs) out.push('..')
      continue
    }
    out.push(part)
  }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.')
}

/** null when the selection doesn't look like a path. Relative paths resolve against cwd (which may start with ~). */
export function pathFromSelection(sel: string, cwd: string | null | undefined): string | null {
  let s = String(sel ?? '').trim()
  if (!s || s.includes('\n') || s.length > 1024) return null
  s = s.replace(/[:,;)]+$/, '').replace(/^['"`]|['"`]$/g, '')
  if (/\s/.test(s) || /^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return null
  if (s === '~' || s.startsWith('~/')) return s.length > 2 ? '~/' + normalizePosix(s.slice(2)).replace(/^\.$/, '') : '~'
  if (s.startsWith('/')) return normalizePosix(s)
  if (!(s.startsWith('./') || s.startsWith('../') || s.includes('/'))) return null
  const base = String(cwd ?? '').trim()
  if (!base) return null
  if (base === '~' || base.startsWith('~/')) {
    const rest = normalizePosix((base === '~' ? '' : base.slice(2)) + '/' + s)
    return rest === '.' ? '~' : '~/' + rest
  }
  if (!base.startsWith('/')) return null
  return normalizePosix(base + '/' + s)
}

export function parentPath(p: string): string {
  const i = p.replace(/\/+$/, '').lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}
