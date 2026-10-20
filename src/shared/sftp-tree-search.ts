/** D75: search file names under a remote folder by walking SFTP listings (no shell command runs). */
import type { SftpListEntry, SftpListResult } from './ipc'

export const TREE_SKIP = new Set(['.git', 'node_modules', '.cache', '__pycache__', 'proc', 'sys'])
export type TreeLimits = { maxDepth: number; maxDirs: number; maxHits: number }
export const TREE_LIMITS: TreeLimits = { maxDepth: 5, maxDirs: 400, maxHits: 200 }
export type TreeHit = { path: string; name: string; isDirectory: boolean; size: number; rel: string }
export type TreeResult = { hits: TreeHit[]; dirs: number; truncated: boolean }

/** Breadth-first; symlinked folders are not followed. Case-insensitive substring on the name. */
export async function searchTree(
  root: string,
  query: string,
  list: (dir: string) => Promise<SftpListResult>,
  limits: TreeLimits = TREE_LIMITS,
  signal: { cancelled: boolean } = { cancelled: false }
): Promise<TreeResult> {
  const q = query.trim().toLowerCase()
  const hits: TreeHit[] = []
  if (!q) return { hits, dirs: 0, truncated: false }
  const base = root.replace(/\/+$/, '') || '/'
  const queue: { dir: string; depth: number }[] = [{ dir: base, depth: 0 }]
  let dirs = 0
  let truncated = false
  while (queue.length) {
    if (signal.cancelled) break
    if (dirs >= limits.maxDirs) {
      truncated = true
      break
    }
    const { dir, depth } = queue.shift()!
    dirs++
    let entries: SftpListEntry[]
    try {
      entries = (await list(dir)).entries
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.name === '.' || e.name === '..') continue
      if (e.name.toLowerCase().includes(q)) {
        const rel = e.path.startsWith(base === '/' ? '/' : base + '/') ? e.path.slice(base === '/' ? 1 : base.length + 1) : e.path
        hits.push({ path: e.path, name: e.name, isDirectory: e.isDirectory, size: e.size, rel })
        if (hits.length >= limits.maxHits) return { hits, dirs, truncated: true }
      }
      if (e.isDirectory && !e.link && !TREE_SKIP.has(e.name) && depth + 1 <= limits.maxDepth) queue.push({ dir: e.path, depth: depth + 1 })
      else if (e.isDirectory && depth + 1 > limits.maxDepth) truncated = true
    }
  }
  if (queue.length && !signal.cancelled) truncated = true
  return { hits, dirs, truncated }
}
