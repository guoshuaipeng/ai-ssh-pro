/** Normalize a pasted/typed SFTP path before jumping. */
export function normalizeGotoPath(raw: string, kind: 'local' | 'remote'): string {
  let s = String(raw ?? '').trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  if (!s) return kind === 'remote' ? '/' : s
  if (kind === 'remote' && !s.startsWith('/')) s = `/${s}`
  if (kind === 'remote') s = s.replace(/\\/g, '/')
  return s
}
