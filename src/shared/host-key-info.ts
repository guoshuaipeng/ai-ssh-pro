/** D23: host key details shown at first connect / key change. Pure, shared by main and renderer. */

/** Key algorithm from the SSH wire blob (uint32 length + name), e.g. 'ssh-ed25519'. */
export function hostKeyType(blob: Uint8Array): string | undefined {
  if (!blob || blob.length < 8) return undefined
  const len = ((blob[0]! << 24) | (blob[1]! << 16) | (blob[2]! << 8) | blob[3]!) >>> 0
  if (len < 3 || len > 64 || 4 + len > blob.length) return undefined
  let s = ''
  for (let i = 4; i < 4 + len; i++) {
    const c = blob[i]!
    if (c < 0x20 || c > 0x7e) return undefined
    s += String.fromCharCode(c)
  }
  return s
}

/** Short label: ED25519 / RSA / ECDSA-256 … */
export function hostKeyLabel(type: string | undefined): string {
  if (!type) return ''
  if (type === 'ssh-ed25519') return 'ED25519'
  if (type === 'ssh-rsa' || type.startsWith('rsa-sha2')) return 'RSA'
  const m = /^ecdsa-sha2-nistp(\d+)$/.exec(type)
  if (m) return `ECDSA-${m[1]}`
  if (type === 'ssh-dss') return 'DSA'
  return type
}

/** Command to run on the server (console / another trusted session) to print the fingerprint to compare. */
export function verifyCommand(type: string | undefined): string {
  const file =
    type === 'ssh-ed25519' ? 'ed25519' : type === 'ssh-rsa' || type?.startsWith('rsa-sha2') ? 'rsa' : type?.startsWith('ecdsa') ? 'ecdsa' : '*'
  return `ssh-keygen -lf /etc/ssh/ssh_host_${file}_key.pub`
}

/** A changed key can only be trusted after the user says they verified it out of band. */
export function canTrust(reason: 'unknown' | 'changed', verified: boolean): boolean {
  return reason === 'unknown' || verified
}
