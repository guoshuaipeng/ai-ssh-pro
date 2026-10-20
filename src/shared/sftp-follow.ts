/** D12: SFTP remote pane follows the terminal cwd. */
import { resolveHomePath } from './typed-command'

export const SFTP_FOLLOW_KEY = 'aiss.sftp.followCwd'

/** Default on; stored only when turned off. */
export function sftpFollowEnabled(get: (k: string) => string | null): boolean {
  return get(SFTP_FOLLOW_KEY) !== '0'
}

/** D12b: symlink bit in an lstat mode */
export function isSymlinkMode(mode: number | undefined): boolean {
  return typeof mode === 'number' && (mode & 0o170000) === 0o120000
}

/** D12b: why following the terminal failed, so the pane can stay where it is instead of showing an error. */
export function followFailure(err: unknown): 'denied' | 'missing' | null {
  const o = err as { code?: unknown; message?: unknown } | null
  const code = o && typeof o === 'object' ? o.code : undefined
  const msg = String((o && typeof o === 'object' ? o.message : err) ?? '')
  if (code === 3 || code === 'EACCES' || /permission denied|EACCES|access denied/i.test(msg)) return 'denied'
  if (code === 2 || code === 'ENOENT' || /no such file|ENOENT|not found/i.test(msg)) return 'missing'
  return null
}

const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)

/** Directory the remote pane should move to, or null to stay. `~` paths need the SFTP home. */
export function followTarget(o: { follow: boolean; cwd: string | null; current: string; home: string | null }): string | null {
  if (!o.follow || !o.cwd) return null
  const abs = o.cwd.startsWith('~') ? resolveHomePath(o.cwd, o.home) : o.cwd.startsWith('/') ? o.cwd : null
  if (!abs) return null
  const t = norm(abs)
  return t === norm(o.current) ? null : t
}
