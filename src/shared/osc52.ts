/**
 * OSC 52 clipboard (remote → local). Spec: ESC ] 52 ; Pc ; Pd BEL/ST
 * Pd = Base64 payload to set clipboard, "?" to query, empty/invalid clears.
 * We only honor writes by default; queries are refused (host must not read local clipboard).
 */

export const OSC52_MAX_BYTES = 1024 * 1024

export type Osc52Parse =
  | { kind: 'write'; selection: string; text: string }
  | { kind: 'query'; selection: string }
  | { kind: 'clear'; selection: string }
  | { kind: 'ignore'; reason: string }

/** Decode standard Base64 to UTF-8 text. Returns null if invalid or over maxBytes. */
export function decodeOsc52Base64(b64: string, maxBytes = OSC52_MAX_BYTES): string | null {
  const cleaned = String(b64 ?? '').replace(/\s+/g, '')
  if (!cleaned) return ''
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null
  try {
    const bin =
      typeof atob === 'function'
        ? atob(cleaned)
        : Buffer.from(cleaned, 'base64').toString('binary')
    if (bin.length > maxBytes) return null
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * Parse the OSC 52 *payload* (what xterm passes to registerOscHandler(52), i.e. after "52;").
 * Typical: "c;SGVsbG8=" or "c;?" or ";SGVsbG8=".
 */
export function parseOsc52Payload(data: string): Osc52Parse {
  const raw = String(data ?? '')
  const semi = raw.indexOf(';')
  if (semi < 0) return { kind: 'ignore', reason: 'no-semi' }
  const selection = (raw.slice(0, semi) || 'c').trim() || 'c'
  const pd = raw.slice(semi + 1)
  if (pd === '?') return { kind: 'query', selection }
  if (pd === '') return { kind: 'clear', selection }
  const text = decodeOsc52Base64(pd)
  if (text == null) return { kind: 'ignore', reason: 'bad-b64' }
  if (text === '' && pd.replace(/\s+/g, '') !== '') return { kind: 'clear', selection }
  return { kind: 'write', selection, text }
}
