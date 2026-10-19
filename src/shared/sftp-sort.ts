/** Sort SFTP entries: directories first, then by name or mtime. */
export type SftpSortMode = 'name' | 'mtime'

export function sortSftpEntries<T extends { name: string; isDirectory: boolean; modifyTime?: number }>(
  entries: readonly T[],
  mode: SftpSortMode
): T[] {
  const dirFirst = (a: T, b: T) => (a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1)
  return [...entries].sort((a, b) => {
    const d = dirFirst(a, b)
    if (d) return d
    if (mode === 'mtime') {
      const am = typeof a.modifyTime === 'number' ? a.modifyTime : 0
      const bm = typeof b.modifyTime === 'number' ? b.modifyTime : 0
      if (am !== bm) return bm - am
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}
