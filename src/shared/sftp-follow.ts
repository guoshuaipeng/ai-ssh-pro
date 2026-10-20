/** D12: SFTP remote pane follows the terminal cwd. */
import { resolveHomePath } from './typed-command'

export const SFTP_FOLLOW_KEY = 'aiss.sftp.followCwd'

/** Default on; stored only when turned off. */
export function sftpFollowEnabled(get: (k: string) => string | null): boolean {
  return get(SFTP_FOLLOW_KEY) !== '0'
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
