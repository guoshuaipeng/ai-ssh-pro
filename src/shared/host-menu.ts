/** UX-19: host context menu order. Docker is not a row; delete stays last. */

export const HOST_MENU_SINGLE = [
  'connect',
  'connectNew',
  'sftp',
  'monitor',
  'toolbox',
  'edit',
  'profile',
  'rename',
  'move',
  'copyAddr',
  'delete'
] as const

export const HOST_MENU_MULTI = ['batch', 'monitorBoard', 'setLevel', 'move', 'delete'] as const

export type HostMenuKey = (typeof HOST_MENU_SINGLE)[number] | (typeof HOST_MENU_MULTI)[number]

/** True when `source` lists data-ctx keys in this order (separators allowed between them). */
export function menuSourceFollows(source: string, keys: readonly string[]): boolean {
  let at = 0
  for (const key of keys) {
    const token = `data-ctx="${key}"`
    const i = source.indexOf(token, at)
    if (i < 0) return false
    at = i + token.length
  }
  return true
}
