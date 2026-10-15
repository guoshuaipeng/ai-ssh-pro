/** Agent sockets, sk-ed25519 refusal, and OpenSSH certificate attachment for ssh2. */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
// ssh2 attaches `utils` inside an object literal that contains a spread, so Node's
// CJS named-export detector does not expose it. `import { utils } from 'ssh2'`
// throws at load time in the Electron main process (asar). Default import works.
import ssh2, { type ConnectConfig, type ParsedKey } from 'ssh2'
import { detectKeyMaterial, siblingCertPath } from '../shared/ssh-cert'

export class SshAuthError extends Error {
  code: 'NO_AGENT' | 'SK_NEEDS_AGENT' | 'CERT'
  constructor(code: 'NO_AGENT' | 'SK_NEEDS_AGENT' | 'CERT', message: string) {
    super(message)
    this.code = code
  }
}

function readSshString(buf: Buffer, offset: number): { value: Buffer; next: number } | null {
  if (offset + 4 > buf.length) return null
  const len = buf.readUInt32BE(offset)
  const start = offset + 4
  const end = start + len
  if (end > buf.length) return null
  return { value: buf.subarray(start, end), next: end }
}

/** True when the certificate's subject key is the same public key. */
export function certificateMatchesKey(certBlob: Buffer, publicSsh: Buffer): boolean {
  const certType = readSshString(certBlob, 0)
  const nonce = certType ? readSshString(certBlob, certType.next) : null
  const subject = nonce ? readSshString(certBlob, nonce.next) : null
  const ownType = readSshString(publicSsh, 0)
  const ownKey = ownType ? readSshString(publicSsh, ownType.next) : null
  if (!certType || !subject || !ownKey) return false
  if (!certType.value.toString('utf8').includes('-cert-')) return false
  return subject.value.equals(ownKey.value)
}

export function defaultAgentSocket(): string {
  const fromEnv = process.env.SSH_AUTH_SOCK?.trim()
  if (fromEnv) return fromEnv
  if (process.platform === 'win32') return '\\\\.\\pipe\\openssh-ssh-agent'
  return ''
}

export async function applyConnectAuth(
  connectConfig: ConnectConfig,
  auth: {
    password?: string
    privateKeyPath?: string
    passphrase?: string
    authMode?: 'password' | 'key' | 'agent'
    certificatePath?: string
    agentSocket?: string
  },
  opts: { allowDefaultKey: boolean; readDefaultKey?: () => Promise<Buffer | null> }
): Promise<void> {
  if (auth.authMode === 'agent') {
    const socket = (auth.agentSocket || defaultAgentSocket()).trim()
    if (!socket) throw new SshAuthError('NO_AGENT', 'NO_AGENT')
    connectConfig.agent = socket
    return
  }
  if (auth.password && auth.authMode !== 'key') connectConfig.password = auth.password

  let keyPath = auth.privateKeyPath?.trim() || ''
  let keyBuf: Buffer | null = null
  if (keyPath) {
    keyBuf = await readFile(keyPath)
  } else if (!auth.password && opts.allowDefaultKey && opts.readDefaultKey) {
    keyBuf = await opts.readDefaultKey()
  }
  if (!keyBuf) return

  const text = keyBuf.toString('utf8')
  const kind = detectKeyMaterial(text)
  if (kind === 'sk-ed25519') {
    throw new SshAuthError('SK_NEEDS_AGENT', 'SK_NEEDS_AGENT')
  }

  const certPath = (auth.certificatePath || (keyPath ? siblingCertPath(keyPath) : '')).trim()
  if (certPath && existsSync(certPath)) {
    const certBuf = await readFile(certPath)
    const key = ssh2.utils.parseKey(keyBuf, auth.passphrase)
    if (key instanceof Error) throw new SshAuthError('CERT', key.message)
    // ssh2 parses a certificate as a plain key and drops the certificate
    // envelope (the next field is a nonce, not the public key). Offer the
    // original certificate blob and name its algorithm so the handshake is real.
    const parts = certBuf.toString('utf8').trim().split(/\s+/)
    const certType = parts[0] || ''
    const certBlob = Buffer.from(parts[1] || '', 'base64')
    if (!certType.includes('-cert-') || certBlob.length < 16) throw new SshAuthError('CERT', 'CERT')
    const signed = key as ParsedKey
    const ownPub = Buffer.from(signed.getPublicSSH())
    if (!certificateMatchesKey(certBlob, ownPub)) throw new SshAuthError('CERT', 'CERT')
    const offered = Buffer.from(certBlob)
    signed.getPublicSSH = () => Buffer.from(offered)
    signed.type = certType as ParsedKey['type']
    // ssh2's Client only keeps privateKey when it is a string or Buffer, so a
    // ParsedKey assigned here is dropped. authHandler is how the certificate
    // key object actually reaches USERAUTH_REQUEST.
    const username = connectConfig.username || ''
    let offeredCert = false
    connectConfig.authHandler = () => {
      if (offeredCert) return false
      offeredCert = true
      return { type: 'publickey', username, key: signed }
    }
    connectConfig.privateKey = keyBuf
    return
  }

  connectConfig.privateKey = keyBuf
  if (auth.passphrase) connectConfig.passphrase = auth.passphrase
}
