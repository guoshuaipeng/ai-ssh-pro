/** D71: name check for "new file" in SFTP. Never overwrites: an existing name is refused. */
export type NewFileProblem = 'empty' | 'slash' | 'dots' | 'exists' | null

export function newFileProblem(raw: string | null | undefined, existing: string[]): NewFileProblem {
  const name = (raw ?? '').trim()
  if (!name) return 'empty'
  if (/[\/\\\u0000]/.test(name)) return 'slash'
  if (name === '.' || name === '..') return 'dots'
  if (existing.includes(name)) return 'exists'
  return null
}
