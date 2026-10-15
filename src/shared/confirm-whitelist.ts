/**
 * IX-2: the only ids allowed to call askConfirm.
 * Anything reversible runs immediately and offers toastUndo (≥5s).
 *
 * Live terminal close (`confirm.closeLiveTerminal`) stays here because the
 * session process is torn down and cannot be restored silently.
 * Killing a process (`confirm.killProcess`) is the same class of high-cost op.
 */
export const CONFIRM_IDS = [
  'confirm.deleteConnections',
  'confirm.deleteGroups',
  'confirm.clearAudit',
  'confirm.dangerCommand',
  'confirm.stopService',
  'confirm.killProcess',
  'confirm.overwriteImportSecrets',
  'confirm.prodGuardTempLift',
  'confirm.deleteRecordings',
  'confirm.playbookDestructive',
  'confirm.syncOverwrite',
  'confirm.batchJumpOverride',
  'confirm.quitWithDirty',
  'confirm.closeLiveTerminal'
] as const

export type ConfirmId = (typeof CONFIRM_IDS)[number]

export const CONFIRM_WHITELIST: ReadonlySet<string> = new Set(CONFIRM_IDS)

const BANNED_CONFIRM_LABELS = new Set(['确定', '确定？', 'ok', 'yes', '是'])

export function isBannedConfirmLabel(label: string | undefined): boolean {
  const text = (label ?? '').trim().toLowerCase()
  return !text || BANNED_CONFIRM_LABELS.has(text)
}

export function assertConfirmAllowed(id: string | undefined | null): asserts id is ConfirmId {
  if (!id || !CONFIRM_WHITELIST.has(id)) {
    throw new Error(`askConfirm id is not on the whitelist: ${id ?? '(missing)'}`)
  }
}

/** Undo toasts last at least 5s. Default is 8s. */
export function undoDurationMs(ms?: number): number {
  const n = ms ?? 8000
  if (n < 5000) throw new Error('undo toast must last at least 5000ms')
  return n
}
