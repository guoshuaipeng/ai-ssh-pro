import type { SavedSessionProfile, SshConnectOptions } from '@shared/ipc'
import { chainFromProfile, hopToJump } from '@shared/jump-chain'

/** Fields a connect must carry so jump, agent, and certificate settings are not dropped. */
export function connectOptsFromProfile(p: SavedSessionProfile): SshConnectOptions {
  const chain = chainFromProfile(p)
  return {
    host: p.host,
    port: p.port,
    username: p.username,
    privateKeyPath: p.privateKeyPath,
    password: p.password?.trim() || undefined,
    passphrase: p.passphrase?.trim() || undefined,
    label: p.label,
    ...(p.demo ? { demo: true } : {}),
    ...(p.authMode ? { authMode: p.authMode } : {}),
    ...(p.certificatePath ? { certificatePath: p.certificatePath } : {}),
    ...(chain.length ? { jumpChain: chain, jumpHost: hopToJump(chain[0]!) } : {}),
    ...(p.forwards?.length ? { forwards: p.forwards } : {})
  }
}
