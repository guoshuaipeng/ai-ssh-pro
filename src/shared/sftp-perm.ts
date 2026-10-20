/** D93: SFTP permission edits (octal or symbolic like u+x); applied via SFTP chmod, never a shell command. */
export function permBits(mode: number | undefined): number | null {
  return typeof mode === 'number' && Number.isFinite(mode) ? mode & 0o7777 : null
}

export function toOctal(bits: number): string {
  return (bits & 0o7777).toString(8).padStart(3, '0')
}

export function toRwx(bits: number): string {
  const r = (b: number, s: number, x: string) => ((b >> s) & 4 ? 'r' : '-') + ((b >> s) & 2 ? 'w' : '-') + ((b >> s) & 1 ? x : '-')
  return r(bits, 6, 'x') + r(bits, 3, 'x') + r(bits, 0, 'x')
}

/** Accepts "755", "0644", "u+x", "go-w", "a+r", "+x" (= a+x), comma lists. null = invalid. */
export function parseMode(input: string, current: number): number | null {
  const s = input.trim()
  if (/^0?[0-7]{3,4}$/.test(s)) return parseInt(s, 8) & 0o7777
  let bits = current & 0o7777
  for (const part of s.split(',')) {
    const m = /^([ugoa]*)([+\-=])([rwx]+)$/.exec(part.trim())
    if (!m) return null
    const who = m[1] || 'a'
    let mask = 0
    for (const c of m[3]!) mask |= c === 'r' ? 4 : c === 'w' ? 2 : 1
    const shifts = [...new Set([...(who.includes('a') ? 'ugo' : who)].map((c) => (c === 'u' ? 6 : c === 'g' ? 3 : 0)))]
    for (const sh of shifts) {
      const v = mask << sh
      if (m[2] === '+') bits |= v
      else if (m[2] === '-') bits &= ~v
      else bits = (bits & ~(7 << sh)) | v
    }
  }
  return bits
}
