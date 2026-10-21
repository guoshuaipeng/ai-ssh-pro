/** SN3: categories of user snippets, then built-in tags; unique, trimmed, in first-seen order. */
export function snippetCategories(mine: ReadonlyArray<{ category?: string }>, builtinTags: readonly string[] = []): string[] {
  const out: string[] = []
  for (const c of [...mine.map((s) => s.category ?? ''), ...builtinTags]) {
    const v = c.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}
