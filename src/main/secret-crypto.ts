import { safeStorage } from 'electron'

/** Prefix for values encrypted with Electron safeStorage (OS keychain-backed). */
export const SECRET_PREFIX = 'enc:v1:'

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX)
}

/**
 * Encrypt a secret for at-rest storage.
 * Falls back to plaintext if OS encryption is unavailable (e.g. some CI/headless envs).
 */
export function encryptSecret(plain: string): string {
  if (!plain) return plain
  if (isEncryptedSecret(plain)) return plain
  if (!safeStorage.isEncryptionAvailable()) return plain
  const buf = safeStorage.encryptString(plain)
  return SECRET_PREFIX + buf.toString('base64')
}

/** Decrypt a stored secret; plaintext values pass through unchanged (legacy migration). */
export function decryptSecret(stored: string): string {
  if (!stored) return stored
  if (!isEncryptedSecret(stored)) return stored
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统安全存储不可用，无法解密已保存的密码 / API Key')
  }
  const b64 = stored.slice(SECRET_PREFIX.length)
  return safeStorage.decryptString(Buffer.from(b64, 'base64'))
}

export function encryptOptional(value: string | undefined): string | undefined {
  if (value == null || value === '') return undefined
  return encryptSecret(value)
}

export function decryptOptional(value: string | undefined): string | undefined {
  if (value == null || value === '') return undefined
  return decryptSecret(value)
}
