/** D65: pick batch targets by folder or tag. Pure helpers. */
export type BatchTargetGroup = { key: string; label: string; kind: 'folder' | 'tag'; ids: string[] }

export function batchGroups(
  sessions: { sessionId: string; folderId?: string; tags?: string[] }[],
  folders: { id: string; name: string }[]
): BatchTargetGroup[] {
  const out: BatchTargetGroup[] = []
  for (const f of folders) {
    const ids = sessions.filter((s) => s.folderId === f.id).map((s) => s.sessionId)
    if (ids.length) out.push({ key: `f:${f.id}`, label: f.name, kind: 'folder', ids })
  }
  const tags = new Map<string, string[]>()
  for (const s of sessions) for (const t of new Set((s.tags ?? []).map((x) => x.trim()).filter(Boolean))) tags.set(t, [...(tags.get(t) ?? []), s.sessionId])
  for (const [t, ids] of [...tags.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out.push({ key: `t:${t}`, label: `#${t}`, kind: 'tag', ids })
  return out
}

/** Click a group: add all of it, or remove all when every member is already ticked. */
export function toggleGroup(selected: Set<string>, ids: string[]): Set<string> {
  const next = new Set(selected)
  const all = ids.length > 0 && ids.every((id) => next.has(id))
  for (const id of ids) {
    if (all) next.delete(id)
    else next.add(id)
  }
  return next
}

export function groupState(selected: Set<string>, ids: string[]): 'all' | 'some' | 'none' {
  const n = ids.filter((id) => selected.has(id)).length
  return n === 0 ? 'none' : n === ids.length ? 'all' : 'some'
}
