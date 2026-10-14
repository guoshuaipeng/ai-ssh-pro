/** D5: read-only local ↔ remote file compare helpers. */
export const COMPARE_BYTE_LIMIT = 2 * 1024 * 1024

export type MiniDiff = { type: 'same' | 'add' | 'del'; text: string; a?: number; b?: number }

export function isTooLargeToCompare(size: number | undefined | null): boolean {
  return typeof size === 'number' && size > COMPARE_BYTE_LIMIT
}

export type SideCell = { text: string; line?: number; kind: 'same' | 'add' | 'del' | 'empty' }

export type SideRow = { left: SideCell; right: SideCell }

/** Pair a unified line diff into side-by-side rows. */
export function pairSideBySide(lines: MiniDiff[]): SideRow[] {
  const rows: SideRow[] = []
  let i = 0
  while (i < lines.length) {
    const cur = lines[i]!
    if (cur.type === 'same') {
      rows.push({
        left: { text: cur.text, line: cur.a, kind: 'same' },
        right: { text: cur.text, line: cur.b, kind: 'same' }
      })
      i++
      continue
    }
  const dels: MiniDiff[] = []
  const adds: MiniDiff[] = []
    while (i < lines.length && lines[i]!.type === 'del') dels.push(lines[i++]!)
    while (i < lines.length && lines[i]!.type === 'add') adds.push(lines[i++]!)
    const n = Math.max(dels.length, adds.length)
    for (let k = 0; k < n; k++) {
      const d = dels[k]
      const a = adds[k]
      rows.push({
        left: d ? { text: d.text, line: d.a, kind: 'del' } : { text: '', kind: 'empty' },
        right: a ? { text: a.text, line: a.b, kind: 'add' } : { text: '', kind: 'empty' }
      })
    }
  }
  return rows
}

export function toUnified(lines: MiniDiff[], leftName: string, rightName: string): string {
  const out = [`--- ${leftName}`, `+++ ${rightName}`]
  for (const l of lines) {
    const mark = l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '
    out.push(`${mark}${l.text}`)
  }
  return out.join('\n')
}
