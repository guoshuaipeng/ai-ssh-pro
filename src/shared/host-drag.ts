/** D87: drag saved hosts onto a sidebar folder. */
export const HOST_DRAG_MIME = 'application/x-aiss-hosts'

/** A row inside a multi-selection drags the whole selection; otherwise just that row. */
export function dragIds(id: string, multiSelected: readonly string[]): string[] {
  return multiSelected.length >= 2 && multiSelected.includes(id) ? [...multiSelected] : [id]
}

export function encodeHostDrag(ids: readonly string[]): string {
  return JSON.stringify({ v: 1, ids })
}

export function decodeHostDrag(raw: string): string[] {
  try {
    const o = JSON.parse(raw) as { v?: number; ids?: unknown }
    return o?.v === 1 && Array.isArray(o.ids) ? o.ids.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** D90: ids that are currently in some folder (only those leave on "ungroup"). */
export function ungroupPlan(ids: readonly string[], profiles: readonly { id: string; folderId?: string }[]): string[] {
  const want = new Set(ids)
  return profiles.filter((p) => want.has(p.id) && p.folderId).map((p) => p.id)
}

/** Ids that would actually move (already-there hosts are skipped). */
export function dropPlan(ids: readonly string[], profiles: readonly { id: string; folderId?: string }[], folderId: string): string[] {
  const want = new Set(ids)
  return profiles.filter((p) => want.has(p.id) && p.folderId !== folderId).map((p) => p.id)
}
