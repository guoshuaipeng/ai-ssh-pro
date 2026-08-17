import type { SavedSessionProfile } from '@shared/ipc'

/** 按 label / host / username 不区分大小写过滤已保存会话 */
export function filterProfiles(
  profiles: SavedSessionProfile[],
  query: string
): SavedSessionProfile[] {
  const q = query.trim().toLowerCase()
  if (!q) return profiles
  return profiles.filter((p) => {
    const label = (p.label || '').toLowerCase()
    const host = (p.host || '').toLowerCase()
    const username = (p.username || '').toLowerCase()
    return label.includes(q) || host.includes(q) || username.includes(q)
  })
}
