/** D8: one SFTP center tab per remote host, keyed by profile id. */

export const SFTP_TAB_TITLE_MAX = 24

/** D7: readonly pwd on the same connection. Keep this short. */
export const PWD_TIMEOUT_MS = 2000

export type SftpHostRef = {
  profileId?: string
  host?: string
  port?: number
  username?: string
}

export type SftpTabRef = SftpHostRef & {
  tabId: string
  view?: string
}

export function sftpHostKey(ref: SftpHostRef): string {
  const pid = ref.profileId?.trim()
  if (pid) return `profile:${pid}`
  const host = (ref.host || '').trim().toLowerCase()
  const user = (ref.username || '').trim()
  const port = ref.port && ref.port > 0 ? ref.port : 22
  if (!host && !user) return ''
  return `addr:${user}@${host}:${port}`
}

/** Existing SFTP tab for this host, if any. Different hosts do not match. */
export function findSftpTab<T extends SftpTabRef>(tabs: readonly T[], host: SftpHostRef): T | undefined {
  const key = sftpHostKey(host)
  if (!key) return undefined
  return tabs.find((t) => t.view === 'sftp' && sftpHostKey(t) === key)
}

/**
 * Same host → focus the open tab (caller must not reset paths).
 * Other host → create a new tab beside the current one.
 */
export function planSftpOpen<T extends SftpTabRef>(
  tabs: readonly T[],
  host: SftpHostRef
): { action: 'focus'; tabId: string } | { action: 'create' } {
  const hit = findSftpTab(tabs, host)
  if (hit) return { action: 'focus', tabId: hit.tabId }
  return { action: 'create' }
}

export function formatSftpTabTitle(host: string, max = SFTP_TAB_TITLE_MAX): string {
  const name = host.trim()
  const full = name ? `SFTP · ${name}` : 'SFTP'
  return full.length <= max ? full : full.slice(0, max)
}

export type PwdResult = { code: number | null; stdout: string; stderr?: string }

/** Absolute path from a short `pwd`, or null when the probe failed or timed out. */
export function cwdFromPwd(result: PwdResult | null | undefined): string | null {
  if (!result || result.code !== 0) return null
  if (/timeout/i.test(result.stderr || '')) return null
  const lines = result.stdout.replace(/\r/g, '').split('\n').map((s) => s.trim()).filter(Boolean)
  const line = lines[lines.length - 1]
  if (!line || !line.startsWith('/') || line.includes('\0')) return null
  return line
}
