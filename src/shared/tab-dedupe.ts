/** D101: same-name tabs get an ordinal (· 2, · 3) in strip order so they can be told apart. The first keeps its plain name. */
export function dupOrdinals(items: ReadonlyArray<{ id: string; label: string }>): Map<string, number> {
  const count = new Map<string, number>()
  for (const it of items) count.set(it.label, (count.get(it.label) ?? 0) + 1)
  const seen = new Map<string, number>()
  const out = new Map<string, number>()
  for (const it of items) {
    if ((count.get(it.label) ?? 0) < 2) continue
    const n = (seen.get(it.label) ?? 0) + 1
    seen.set(it.label, n)
    if (n > 1) out.set(it.id, n)
  }
  return out
}

export function withOrdinal(label: string, n: number | undefined): string {
  return n ? `${label} · ${n}` : label
}
