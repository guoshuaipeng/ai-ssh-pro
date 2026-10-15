/** UX-31b: vaultPass → syncPassphrase. Old configs stay readable. */

export type SyncSecretRecord = {
  syncPassphrase?: string
  vaultPass?: string
}

/** Prefer the new key. Fall back to the legacy vaultPass ciphertext. */
export function readSyncPassphrase(raw: SyncSecretRecord | null | undefined): { stored?: string; fromLegacy: boolean } {
  if (!raw) return { fromLegacy: false }
  if (raw.syncPassphrase) return { stored: raw.syncPassphrase, fromLegacy: false }
  if (raw.vaultPass) return { stored: raw.vaultPass, fromLegacy: true }
  return { fromLegacy: false }
}

/** Next save writes only the new key. */
export function writeSyncPassphrase(encrypted: string | undefined): { syncPassphrase?: string } {
  if (!encrypted) return {}
  return { syncPassphrase: encrypted }
}

export function migrateSyncRecord<T extends SyncSecretRecord>(raw: T): Omit<T, 'vaultPass' | 'syncPassphrase'> & { syncPassphrase?: string } {
  const { vaultPass: _legacy, syncPassphrase, ...rest } = raw
  const read = readSyncPassphrase(raw)
  return { ...rest, ...(read.stored ? { syncPassphrase: syncPassphrase || read.stored } : {}) }
}
