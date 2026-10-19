/** Lightweight per-host session notes. */

export const SESSION_NOTE_MAX = 120

export function normalizeSessionNote(raw: unknown): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > SESSION_NOTE_MAX ? s.slice(0, SESSION_NOTE_MAX) : s
}

export function sessionNotePreview(note: string | undefined, max = 40): string {
  const s = normalizeSessionNote(note)
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
