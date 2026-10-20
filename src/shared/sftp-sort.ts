/** Sort SFTP entries: directories first, then by name, mtime or size. */
export type SftpSortMode = 'name' | 'mtime' | 'size'

/** D81: natural first direction per column (name A→Z, newest first, largest first). */
export const DEFAULT_DESC: Record<SftpSortMode, boolean> = { name: false, mtime: true, size: true }

/** D81: clicking a header: same column flips, another column starts at its natural direction. */
export function nextSort(cur: { mode: SftpSortMode; flip: boolean }, clicked: SftpSortMode): { mode: SftpSortMode; flip: boolean } {
  return cur.mode === clicked ? { mode: clicked, flip: !cur.flip } : { mode: clicked, flip: false }
}

export function sortIsDesc(mode: SftpSortMode, flip: boolean): boolean {
  return DEFAULT_DESC[mode] !== flip
}

export function sortSftpEntries<T extends { name: string; isDirectory: boolean; modifyTime?: number; size?: number }>(
  entries: readonly T[],
  mode: SftpSortMode,
  flip = false
): T[] {
  const dirFirst = (a: T, b: T) => (a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1)
  const desc = sortIsDesc(mode, flip)
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  return [...entries].sort((a, b) => {
    const d = dirFirst(a, b)
    if (d) return d
    let c = 0
    if (mode === 'mtime') c = (typeof a.modifyTime === 'number' ? a.modifyTime : 0) - (typeof b.modifyTime === 'number' ? b.modifyTime : 0)
    else if (mode === 'size') c = (typeof a.size === 'number' ? a.size : 0) - (typeof b.size === 'number' ? b.size : 0)
    else c = byName(a, b)
    if (c) return desc ? -c : c
    return byName(a, b)
  })
}
