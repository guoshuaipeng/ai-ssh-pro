/** D45: per-host recent remote folders for the SFTP pane (most recent first, max 10). */
export const SFTP_RECENT_KEY = 'aiss.sftp.recentDirs.v1'
export const SFTP_RECENT_MAX = 10
const MAX_HOSTS = 50
/** D47: the local pane uses this pseudo host key */
export const LOCAL_RECENT_KEY = '@local'

type Store = Pick<Storage, 'getItem' | 'setItem'>
type Data = Record<string, { dirs: string[]; at: number }>

function read(store: Store): Data {
  try {
    const raw = JSON.parse(store.getItem(SFTP_RECENT_KEY) || '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Data) : {}
  } catch {
    return {}
  }
}

export function recentDirs(hostKey: string, store: Store = globalThis.localStorage): string[] {
  if (!hostKey) return []
  const d = read(store)[hostKey]
  return Array.isArray(d?.dirs) ? d!.dirs.filter((x) => typeof x === 'string').slice(0, SFTP_RECENT_MAX) : []
}

export function noteRecentDir(hostKey: string, path: string, store: Store = globalThis.localStorage, now = Date.now()): string[] {
  const p = String(path ?? '').trim()
  if (!hostKey || !p) return recentDirs(hostKey, store)
  const data = read(store)
  const dirs = [p, ...recentDirs(hostKey, store).filter((x) => x !== p)].slice(0, SFTP_RECENT_MAX)
  data[hostKey] = { dirs, at: now }
  const keys = Object.keys(data).sort((a, b) => (data[b]!.at || 0) - (data[a]!.at || 0))
  for (const k of keys.slice(MAX_HOSTS)) delete data[k]
  try {
    store.setItem(SFTP_RECENT_KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
  return dirs
}
