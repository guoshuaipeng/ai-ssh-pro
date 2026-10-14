/** D1 transfer queue: resume decisions, part files, persistence shape. */

export const PART_SUFFIX = '.aisshpart'
export const NARROW_PANE_PX = 720

export type TransferDirection = 'upload' | 'download'
export type TransferStatus = 'queued' | 'running' | 'paused' | 'interrupted' | 'done' | 'error' | 'cancelled'

export type TransferTask = {
  id: string
  name: string
  direction: TransferDirection
  localPath: string
  remotePath: string
  hostKey: string
  transferred: number
  total: number
  /** source file mtime (ms) captured when the task was created */
  sourceMtime?: number
  status: TransferStatus
  error?: string
  speedBps?: number
  updatedAt: number
}

export type ResumeAction = 'fresh' | 'resume' | 'source-changed'

export function isPartName(name: string): boolean {
  return name.endsWith(PART_SUFFIX)
}

export function partPath(finalPath: string): string {
  const p = String(finalPath ?? '')
  if (!p || isPartName(p)) return p
  return p + PART_SUFFIX
}

export function finalPathFromPart(path: string): string {
  return isPartName(path) ? path.slice(0, -PART_SUFFIX.length) : path
}

/**
 * Decide whether a partial file can continue.
 * Source mtime mismatch means the user must start over.
 */
export function resumeDecision(input: {
  partSize: number
  total: number
  sourceMtime?: number
  recordedMtime?: number
}): ResumeAction {
  const part = Math.max(0, input.partSize || 0)
  if (part <= 0) return 'fresh'
  if (
    input.recordedMtime != null &&
    input.sourceMtime != null &&
    input.recordedMtime > 0 &&
    input.sourceMtime > 0 &&
    input.sourceMtime !== input.recordedMtime
  ) {
    return 'source-changed'
  }
  if (input.total > 0 && part >= input.total) return 'fresh'
  return 'resume'
}

export function hydrateQueue(raw: unknown): TransferTask[] {
  if (!Array.isArray(raw)) return []
  const out: TransferTask[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Partial<TransferTask>
    if (typeof o.id !== 'string' || typeof o.localPath !== 'string' || typeof o.remotePath !== 'string') continue
    if (o.direction !== 'upload' && o.direction !== 'download') continue
    let status: TransferStatus = o.status && ['queued', 'running', 'paused', 'interrupted', 'done', 'error', 'cancelled'].includes(o.status) ? o.status : 'interrupted'
    if (status === 'running' || status === 'queued') status = 'interrupted'
    if (status === 'done' || status === 'cancelled') continue
    out.push({
      id: o.id,
      name: typeof o.name === 'string' && o.name ? o.name : o.remotePath.split('/').pop() || 'file',
      direction: o.direction,
      localPath: o.localPath,
      remotePath: o.remotePath,
      hostKey: typeof o.hostKey === 'string' ? o.hostKey : '',
      transferred: typeof o.transferred === 'number' && o.transferred > 0 ? o.transferred : 0,
      total: typeof o.total === 'number' && o.total > 0 ? o.total : 0,
      sourceMtime: typeof o.sourceMtime === 'number' ? o.sourceMtime : undefined,
      status,
      error: typeof o.error === 'string' ? o.error : undefined,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now()
    })
  }
  return out
}

export function shouldAutoResume(task: TransferTask, hostKey: string, enabled: boolean): boolean {
  if (!enabled) return false
  if (!hostKey || task.hostKey !== hostKey) return false
  return task.status === 'interrupted' || task.status === 'paused' || task.status === 'queued'
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatSpeed(bps?: number): string {
  if (!bps || bps <= 0) return '—'
  return `${formatBytes(bps)}/s`
}

export function formatEta(transferred: number, total: number, bps?: number): string {
  if (!bps || bps <= 0 || total <= transferred) return ''
  const sec = Math.ceil((total - transferred) / bps)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

export function queueSummary(tasks: TransferTask[]): { active: number; speed: number } {
  const live = tasks.filter((t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused')
  const speed = tasks.filter((t) => t.status === 'running').reduce((s, t) => s + (t.speedBps || 0), 0)
  return { active: live.length, speed }
}

export function pctOf(transferred: number, total: number): number {
  if (!total || total <= 0) return transferred > 0 ? 99 : 0
  return Math.min(100, Math.round((transferred / total) * 100))
}

export function keepBothName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 1
  let next = `${stem} (${i})${ext}`
  while (taken.has(next)) {
    i += 1
    next = `${stem} (${i})${ext}`
  }
  return next
}

export function joinPosix(...parts: string[]): string {
  const cleaned = parts.map((p) => String(p ?? '').replace(/\\/g, '/')).filter((p) => p.length > 0)
  if (!cleaned.length) return '/'
  let result = cleaned[0]!
  for (let i = 1; i < cleaned.length; i++) {
    const seg = cleaned[i]!.replace(/^\/+/, '')
    if (!seg) continue
    result = result.replace(/\/+$/, '') + '/' + seg
  }
  if (!result.startsWith('/')) result = '/' + result
  return result.replace(/\/{2,}/g, '/') || '/'
}

export function parentPosix(path: string): string {
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return '/'
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  return p.slice(0, idx) || '/'
}

export function baseName(path: string): string {
  const norm = String(path ?? '').replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : norm
}
