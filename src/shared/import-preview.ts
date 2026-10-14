/** N2: preview competitor session imports. Passwords and keys never appear in the public preview. */
import type { ImportedSessionDraft, SavedSessionFolder, SavedSessionProfile } from './ipc'

export type ImportPolicy = 'skip' | 'overwrite' | 'copy'

export type PreviewRow = {
  draft: ImportedSessionDraft
  group: string
  conflict: boolean
  existingId?: string
}

export type ImportPreviewModel = {
  rows: PreviewRow[]
  groups: Array<{ name: string; count: number }>
  hostCount: number
  conflictCount: number
  notes: string[]
}

const SECRET_RE =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|((?:password|passwd|passphrase|privateKey|private_key|apiKey|api_key)\s*[:=]\s*)(\S+)/gi

/** Strip secrets from human-readable notes. Session fields themselves are not logged. */
export function redactSecrets(text: string): string {
  return String(text ?? '').replace(SECRET_RE, (m, key: string | undefined) => (key ? `${key}[redacted]` : '[redacted key]'))
}

export function draftGroup(d: ImportedSessionDraft): string {
  const g = d.group?.trim()
  if (g) return g.replace(/\\/g, '/')
  const label = d.label || ''
  const i = Math.max(label.lastIndexOf('/'), label.lastIndexOf('\\'))
  if (i > 0) return label.slice(0, i).replace(/\\/g, '/')
  return ''
}

export function hostKeyOf(p: { host: string; port?: number; username: string }): string {
  return `${p.host}|${p.port || 22}|${p.username}`.toLowerCase()
}

export function buildImportPreview(
  drafts: ImportedSessionDraft[],
  profiles: Array<Pick<SavedSessionProfile, 'id' | 'host' | 'port' | 'username'>>,
  notes: string[] = []
): ImportPreviewModel {
  const byKey = new Map(profiles.map((p) => [hostKeyOf(p), p.id]))
  const rows: PreviewRow[] = drafts.map((draft) => {
    const existingId = byKey.get(hostKeyOf(draft))
    return { draft, group: draftGroup(draft), conflict: Boolean(existingId), existingId }
  })
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.group, (counts.get(r.group) ?? 0) + 1)
  const groups = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return {
    rows,
    groups,
    hostCount: rows.length,
    conflictCount: rows.filter((r) => r.conflict).length,
    notes: notes.map(redactSecrets)
  }
}

export type PublicPreviewRow = {
  label: string
  host: string
  port: number
  username: string
  group: string
  conflict: boolean
}

/** Safe to render or log: no password, passphrase, or key material. */
export function publicRows(model: ImportPreviewModel): PublicPreviewRow[] {
  return model.rows.map((r) => ({
    label: r.draft.label,
    host: r.draft.host,
    port: r.draft.port,
    username: r.draft.username,
    group: r.group,
    conflict: r.conflict
  }))
}

function copyLabel(base: string, taken: Set<string>): string {
  const root = base.replace(/ \(\d+\)$/, '')
  let n = 2
  let next = `${root} (2)`
  while (taken.has(next.toLowerCase())) {
    n += 1
    next = `${root} (${n})`
  }
  taken.add(next.toLowerCase())
  return next
}

export type ApplyResult = {
  profiles: SavedSessionProfile[]
  folders: SavedSessionFolder[]
  added: number
  updated: number
  skipped: number
}

function folderIdFor(name: string, folders: SavedSessionFolder[], newId: () => string): { folders: SavedSessionFolder[]; id: string } {
  const found = folders.find((f) => f.name === name)
  if (found) return { folders, id: found.id }
  const id = newId()
  return { folders: [...folders, { id, name }], id }
}

/** Apply skip / overwrite / copy. Secrets stay on the profile record and are not copied into the result counts. */
export function applyImportPolicy(opts: {
  model: ImportPreviewModel
  policy: ImportPolicy
  profiles: SavedSessionProfile[]
  folders: SavedSessionFolder[]
  newId: () => string
}): ApplyResult {
  let profiles = opts.profiles.map((p) => ({ ...p }))
  let folders = opts.folders.map((f) => ({ ...f }))
  const labels = new Set(profiles.map((p) => (p.label || '').toLowerCase()))
  let added = 0
  let updated = 0
  let skipped = 0
  for (const row of opts.model.rows) {
    const d = row.draft
    let folderId: string | undefined
    if (row.group) {
      const ensured = folderIdFor(row.group, folders, opts.newId)
      folders = ensured.folders
      folderId = ensured.id
    }
    const fields = {
      label: d.label?.trim() || d.username,
      host: d.host,
      port: d.port,
      username: d.username,
      ...(d.password ? { password: d.password } : {}),
      ...(d.privateKeyPath ? { privateKeyPath: d.privateKeyPath } : {}),
      ...(d.passphrase ? { passphrase: d.passphrase } : {}),
      ...(d.jumpHost ? { jumpHost: d.jumpHost } : {}),
      ...(d.forwards?.length ? { forwards: d.forwards } : {}),
      ...(folderId ? { folderId } : {})
    }
    if (row.conflict && row.existingId) {
      if (opts.policy === 'skip') {
        skipped++
        continue
      }
      if (opts.policy === 'overwrite') {
        profiles = profiles.map((p) => (p.id === row.existingId ? { ...p, ...fields, id: p.id } : p))
        updated++
        continue
      }
      const label = copyLabel(fields.label, labels)
      profiles = [...profiles, { ...fields, id: opts.newId(), label }]
      added++
      continue
    }
    labels.add(fields.label.toLowerCase())
    profiles = [...profiles, { ...fields, id: opts.newId() }]
    added++
  }
  return { profiles, folders, added, updated, skipped }
}
