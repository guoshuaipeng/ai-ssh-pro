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
    const cert = ssh2.utils.parseKey(certBuf)
    if (key instanceof Error) throw new SshAuthError('CERT', key.message)
    if (cert instanceof Error) throw new SshAuthError('CERT', cert.message)
    const blob = cert.getPublicSSH()
    const signed = key as ParsedKey
    signed.getPublicSSH = () => blob
    connectConfig.privateKey = signed as unknown as Buffer
    return
  }

  connectConfig.privateKey = keyBuf
  if (auth.passphrase) connectConfig.passphrase = auth.passphrase
}
