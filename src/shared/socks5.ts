/** C1: minimal SOCKS5 server-side parsing (RFC 1928). No auth, CONNECT only. No node imports. */

export const SOCKS_VER = 5

export type Greeting = { kind: 'more' } | { kind: 'bad' } | { kind: 'ok'; noAuth: boolean; used: number }

export function parseGreeting(b: Uint8Array): Greeting {
  if (b.length < 2) return { kind: 'more' }
  if (b[0] !== SOCKS_VER) return { kind: 'bad' }
  const n = b[1]!
  if (b.length < 2 + n) return { kind: 'more' }
  const methods = Array.from(b.subarray(2, 2 + n))
  return { kind: 'ok', noAuth: methods.includes(0), used: 2 + n }
}

export type SocksRequest =
  | { kind: 'more' }
  | { kind: 'bad'; rep: number }
  | { kind: 'ok'; host: string; port: number; used: number }

/** rep codes: 0x01 general failure, 0x07 command not supported, 0x08 address type not supported. */
export function parseRequest(b: Uint8Array): SocksRequest {
  if (b.length < 4) return { kind: 'more' }
  if (b[0] !== SOCKS_VER) return { kind: 'bad', rep: 0x01 }
  const cmd = b[1]!
  const atyp = b[3]!
  let host = ''
  let off = 4
  if (atyp === 1) {
    if (b.length < off + 4 + 2) return { kind: 'more' }
    host = Array.from(b.subarray(off, off + 4)).join('.')
    off += 4
  } else if (atyp === 3) {
    if (b.length < off + 1) return { kind: 'more' }
    const len = b[off]!
    if (b.length < off + 1 + len + 2) return { kind: 'more' }
    host = new TextDecoder().decode(b.subarray(off + 1, off + 1 + len))
    off += 1 + len
  } else if (atyp === 4) {
    if (b.length < off + 16 + 2) return { kind: 'more' }
    const parts: string[] = []
    for (let i = 0; i < 16; i += 2) parts.push(((b[off + i]! << 8) | b[off + i + 1]!).toString(16))
    host = parts.join(':')
    off += 16
  } else {
    return { kind: 'bad', rep: 0x08 }
  }
  const port = (b[off]! << 8) | b[off + 1]!
  off += 2
  if (cmd !== 1) return { kind: 'bad', rep: 0x07 }
  if (!host || port < 1) return { kind: 'bad', rep: 0x01 }
  return { kind: 'ok', host, port, used: off }
}

/** Reply with a zero bound address; clients ignore it for CONNECT. */
export function socksReply(rep: number): Uint8Array {
  return Uint8Array.from([SOCKS_VER, rep, 0, 1, 0, 0, 0, 0, 0, 0])
}

export const GREETING_NO_AUTH = Uint8Array.from([SOCKS_VER, 0])
export const GREETING_REJECT = Uint8Array.from([SOCKS_VER, 0xff])

/** Text for the browser proxy hint. */
export function socksProxyUrl(port: number): string {
  return `socks5h://127.0.0.1:${port}`
}
