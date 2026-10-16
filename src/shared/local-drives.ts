/** D6: local drive / volume switcher for the SFTP local pane. */

export type LocalDrive = {
  id: string
  /** Directory to open when the user picks this drive. */
  root: string
  label: string
  ready: boolean
  volume?: string
}

export type LocalDriveListing = {
  platform: 'win32' | 'posix'
  drives: LocalDrive[]
}

const VIRTUAL_FS = new Set([
  'proc',
  'sysfs',
  'cgroup',
  'cgroup2',
  'tmpfs',
  'devtmpfs',
  'devpts',
  'securityfs',
  'pstore',
  'bpf',
  'tracefs',
  'debugfs',
  'hugetlbfs',
  'mqueue',
  'configfs',
  'fusectl',
  'binfmt_misc',
  'autofs',
  'rpc_pipefs',
  'nsfs',
  'ramfs',
  'squashfs',
  'overlay',
  'efivarfs'
])

export function normLocalPath(p: string, win: boolean): string {
  let s = String(p ?? '').replace(/\\/g, '/')
  if (s.length > 1) s = s.replace(/\/+$/, '')
  if (win) s = s.toLowerCase()
  return s
}

export function listedPathMatchesRequest(requested: string, listed: string, win: boolean): boolean {
  const want = normLocalPath(requested, win)
  if (!want) return true
  return want === normLocalPath(listed, win)
}

export function drivesFromWinDisks(raw: unknown): LocalDrive[] {
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []
  const out: LocalDrive[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const rec = row as { DeviceID?: unknown; VolumeName?: unknown; Size?: unknown }
    const id = String(rec.DeviceID ?? '').trim().toUpperCase()
    if (!/^[A-Z]:$/.test(id)) continue
    const volume = String(rec.VolumeName ?? '').trim()
    const size = typeof rec.Size === 'number' ? rec.Size : Number(rec.Size)
    const ready = Number.isFinite(size) && size > 0
    out.push({
      id,
      root: `${id}\\`,
      label: volume ? `${id} · ${volume}` : id,
      volume: volume || undefined,
      ready
    })
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

export function unescapeMount(token: string): string {
  return token.replace(/\\040/g, ' ').replace(/\\011/g, '\t').replace(/\\012/g, '\n').replace(/\\134/g, '\\')
}

/** Mount points from `/proc/mounts` text. Virtual filesystems are dropped. */
export function parseProcMounts(text: string): string[] {
  const points: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 3) continue
    const fs = parts[2] || ''
    if (VIRTUAL_FS.has(fs)) continue
    const mp = unescapeMount(parts[1] || '')
    if (!mp.startsWith('/')) continue
    points.push(mp)
  }
  return points
}

export function isExternalMount(mp: string): boolean {
  return mp.startsWith('/mnt/') || mp.startsWith('/media/') || mp.startsWith('/Volumes/') || mp.startsWith('/run/media/')
}

/** `/`, `~`, and external volume mount points. One entry minimum so the control stays visible. */
export function drivesFromMounts(mountpoints: string[], home: string): LocalDrive[] {
  const homeRoot = home && home.trim() ? home : '/'
  const drives: LocalDrive[] = [
    { id: '/', root: '/', label: '/', ready: true },
    { id: '~', root: homeRoot, label: '~', ready: true }
  ]
  const seen = new Set<string>(['/', normLocalPath(homeRoot, false)])
  for (const mp of mountpoints) {
    if (!isExternalMount(mp)) continue
    const key = normLocalPath(mp, false)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const label = key.split('/').filter(Boolean).pop() || key
    drives.push({ id: mp, root: mp, label, ready: true })
  }
  return drives
}

/** Which drive menu item matches the path the local pane is showing. */
export function selectedDriveId(drives: readonly LocalDrive[], absPath: string, platform: 'win32' | 'posix'): string {
  if (!drives.length) return ''
  const win = platform === 'win32'
  if (win) {
    const m = /^([A-Za-z]):/.exec(absPath.trim())
    if (m) {
      const id = `${m[1]!.toUpperCase()}:`
      const hit = drives.find((d) => d.id.toUpperCase() === id)
      if (hit) return hit.id
    }
  }
  const path = normLocalPath(absPath, win) || (win ? '' : '/')
  let best = ''
  let bestLen = -1
  for (const d of drives) {
    const root = normLocalPath(d.root, win)
    if (!root) continue
    const ok = path === root || (root === '/' ? path.startsWith('/') : path.startsWith(`${root}/`))
    if (!ok) continue
    if (root.length > bestLen) {
      best = d.id
      bestLen = root.length
    }
  }
  return best
}
