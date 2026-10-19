/** Case-insensitive substring match for SFTP list filtering. */
export function sftpNameFilterMatch(name: string, query: string): boolean {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return true
  return String(name ?? '').toLowerCase().includes(q)
}
