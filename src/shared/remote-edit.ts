/** D5: remote editor auto-save and conflict rules (no I/O). */
export const AUTO_SAVE_DELAY_MS = 1500

export function planAutoSave(s: {
  enabled: boolean
  dirty: boolean
  blocked: boolean
  truncated: boolean
  conflict: boolean
  saving: boolean
  loading: boolean
  mode: 'edit' | 'diff' | 'conflict'
}): boolean {
  return s.enabled && s.dirty && !s.blocked && !s.truncated && !s.conflict && !s.saving && !s.loading && s.mode === 'edit'
}

/** The remote file changed since we opened (or last saved) it. Truncated reads cannot be compared → no conflict claimed. */
export function remoteChanged(baseline: string, remote: { content: string; truncated: boolean }): boolean {
  return !remote.truncated && remote.content !== baseline
}
