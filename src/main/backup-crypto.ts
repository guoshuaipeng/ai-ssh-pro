import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Password-encrypted backup container: scrypt (N=2^15, r=8, p=1) → AES-256-GCM.
 * Kept free of electron imports so it can be unit tested.
 */
export const BACKUP_FORMAT = 'ai-ssh-pro-backup'
export const BACKUP_MIN_PASSWORD = 8

export type BackupEnvelope = {
  format: typeof BACKUP_FORMAT
  version: 1
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string }
  cipher: 'aes-256-gcm'
  iv: string
  tag: string
  data: string
  createdAt: string
}

const KDF = { N: 1 << 15, r: 8, p: 1 }

function key(password: string, salt: Buffer, N: number, r: number, p: number): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, 32, { N, r, p, maxmem: 128 * N * r * 2 })
}

export function encryptBackup(payload: unknown, password: string): BackupEnvelope {
  if (typeof password !== 'string' || password.length < BACKUP_MIN_PASSWORD) throw new Error('password-too-short')
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(password, salt, KDF.N, KDF.r, KDF.p), iv)
  c.setAAD(Buffer.from(BACKUP_FORMAT))
  const data = Buffer.concat([c.update(JSON.stringify(payload), 'utf8'), c.final()])
  return {
    format: BACKUP_FORMAT,
    version: 1,
    kdf: { name: 'scrypt', ...KDF, salt: salt.toString('base64') },
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    createdAt: new Date().toISOString()
  }
}

export function decryptBackup(raw: string | BackupEnvelope, password: string): unknown {
  let env: BackupEnvelope
  try {
    env = typeof raw === 'string' ? (JSON.parse(raw) as BackupEnvelope) : raw
  } catch {
    throw new Error('not-a-backup')
  }
  if (!env || env.format !== BACKUP_FORMAT || env.version !== 1 || env.cipher !== 'aes-256-gcm' || env.kdf?.name !== 'scrypt') {
    throw new Error('not-a-backup')
  }
  const { N, r, p } = env.kdf
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 1 << 20 || r > 32 || p > 16) throw new Error('not-a-backup')
  try {
    const d = createDecipheriv('aes-256-gcm', key(password, Buffer.from(env.kdf.salt, 'base64'), N, r, p), Buffer.from(env.iv, 'base64'))
    d.setAAD(Buffer.from(BACKUP_FORMAT))
    d.setAuthTag(Buffer.from(env.tag, 'base64'))
    const plain = Buffer.concat([d.update(Buffer.from(env.data, 'base64')), d.final()])
    return JSON.parse(plain.toString('utf8'))
  } catch {
    throw new Error('wrong-password')
  }
}
