/** D2 one-way folder sync on top of the D1 queue. */

export type CompareMode = 'size-mtime' | 'checksum'

export type SyncNode = {
  rel: string
  size: number
  mtime: number
  isDir?: boolean
  checksum?: string
}

export type SyncKind = 'new' | 'changed' | 'deleted' | 'same'

export type SyncRow = {
  rel: string
  kind: SyncKind
  size: number
  isDir?: boolean
  /** D62: changed, and the target copy is newer (syncing would overwrite newer work) */
  targetNewer?: boolean
}

export const DEFAULT_EXCLUDES = ['.git', 'node_modules', '*.log']

export type SyncProfile = {
  id: string
  name: string
  direction: 'upload' | 'download'
  localPath: string
  remotePath: string
  hostKey: string
  compare: CompareMode
  excludes: string[]
  deleteExtra: boolean
}

function globToRegExp(glob: string): RegExp {
  const g = glob.trim().replace(/\\/g, '/')
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!
    if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`(^|/)${re}$`, 'i')
}

/** True when a relative path matches any exclude rule (segment or glob). */
export function matchExclude(rel: string, rules: string[]): boolean {
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!norm) return false
  const parts = norm.split('/')
  for (const raw of rules) {
    const rule = raw.trim()
    if (!rule) continue
    if (rule.includes('*') || rule.includes('?')) {
      if (globToRegExp(rule).test(norm) || parts.some((p) => globToRegExp(rule).test(p))) return true
      continue
    }
    if (parts.includes(rule) || norm === rule || norm.startsWith(rule + '/')) return true
  }
  return false
}

export function relativePath(root: string, full: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const r = norm(root)
  const f = full.replace(/\\/g, '/')
  if (f === r) return ''
  if (f.startsWith(r + '/')) return f.slice(r.length + 1)
  return f.split('/').pop() || f
}

export function parseExcludeText(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** One-way diff. `deleted` rows exist only on the target. Checksums are used when both sides have them. */
export function diffTrees(source: SyncNode[], target: SyncNode[], mode: CompareMode): SyncRow[] {
  const src = new Map(source.filter((n) => !n.isDir).map((n) => [n.rel.replace(/\\/g, '/'), n]))
  const dst = new Map(target.filter((n) => !n.isDir).map((n) => [n.rel.replace(/\\/g, '/'), n]))
  const rows: SyncRow[] = []
  for (const [rel, s] of src) {
    const t = dst.get(rel)
    if (!t) {
      rows.push({ rel, kind: 'new', size: s.size })
      continue
    }
    let changed = s.size !== t.size || Math.abs((s.mtime || 0) - (t.mtime || 0)) > 1000
    if (mode === 'checksum' && s.checksum && t.checksum) changed = s.checksum !== t.checksum
    const row: SyncRow = { rel, kind: changed ? 'changed' : 'same', size: s.size }
    if (changed && (t.mtime || 0) - (s.mtime || 0) > 1000) row.targetNewer = true
    rows.push(row)
  }
  for (const [rel, t] of dst) {
    if (!src.has(rel)) rows.push({ rel, kind: 'deleted', size: t.size })
  }
  const order: Record<SyncKind, number> = { new: 0, changed: 1, deleted: 2, same: 3 }
  rows.sort((a, b) => order[a.kind] - order[b.kind] || a.rel.localeCompare(b.rel))
  return rows
}

/** D62: rows picked by default: everything that differs except changed files whose target is newer. */
export function defaultPicks(rows: SyncRow[]): Record<string, boolean> {
  const init: Record<string, boolean> = {}
  for (const r of rows) if (r.kind !== 'same' && !r.targetNewer) init[r.rel] = true
  return init
}

export function countKinds(rows: SyncRow[]): Record<SyncKind, number> {
  const c: Record<SyncKind, number> = { new: 0, changed: 0, deleted: 0, same: 0 }
  for (const r of rows) c[r.kind] += 1
  return c
}

export function selectedBytes(rows: SyncRow[], selected: Set<string>): number {
  let n = 0
  for (const r of rows) {
    if (r.kind === 'same' || r.kind === 'deleted') continue
    if (selected.has(r.rel)) n += r.size
  }
  return n
}

/** Production hosts: label/tags contain 生产 or prod (S2 marker, used early by D2). */
export function isProductionHost(label: string, tags: string[] = []): boolean {
  const hay = `${label} ${tags.join(' ')}`
  return /生产/i.test(hay) || /(^|[\s,])prod([\s,]|$)/i.test(hay)
}

export function normalizeSyncProfile(raw: unknown): SyncProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<SyncProfile>
  if (typeof o.name !== 'string' || !o.name.trim()) return null
  if (o.direction !== 'upload' && o.direction !== 'download') return null
  if (typeof o.localPath !== 'string' || typeof o.remotePath !== 'string') return null
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `sync-${Date.now()}`,
    name: o.name.trim(),
    direction: o.direction,
    localPath: o.localPath,
    remotePath: o.remotePath,
    hostKey: typeof o.hostKey === 'string' ? o.hostKey : '',
    compare: o.compare === 'checksum' ? 'checksum' : 'size-mtime',
    excludes: Array.isArray(o.excludes) ? o.excludes.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [...DEFAULT_EXCLUDES],
    deleteExtra: Boolean(o.deleteExtra)
  }
}
