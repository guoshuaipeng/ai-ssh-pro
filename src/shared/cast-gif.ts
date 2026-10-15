/** L4c: a small GIF89a writer for terminal-text frames. No native dependency. */

const COLS = 48
const ROWS = 8
const CW = 4
const CH = 6

/** 3x5 glyphs, each row is 3 bits. Missing characters become a dot. */
const GLYPH: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0],
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 7, 1, 7],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7],
  '7': [7, 1, 2, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7],
  a: [0, 7, 1, 7, 5],
  b: [4, 4, 7, 5, 7],
  c: [0, 7, 4, 4, 7],
  d: [1, 1, 7, 5, 7],
  e: [0, 7, 7, 4, 7],
  f: [3, 4, 7, 4, 4],
  g: [0, 7, 5, 7, 1],
  h: [4, 4, 7, 5, 5],
  i: [2, 0, 2, 2, 2],
  j: [1, 0, 1, 5, 7],
  k: [4, 5, 6, 5, 5],
  l: [6, 2, 2, 2, 7],
  m: [0, 7, 7, 5, 5],
  n: [0, 7, 5, 5, 5],
  o: [0, 7, 5, 5, 7],
  p: [0, 7, 5, 7, 4],
  q: [0, 7, 5, 7, 1],
  r: [0, 7, 4, 4, 4],
  s: [0, 7, 4, 1, 7],
  t: [2, 7, 2, 2, 3],
  u: [0, 5, 5, 5, 7],
  v: [0, 5, 5, 5, 2],
  w: [0, 5, 5, 7, 7],
  x: [0, 5, 2, 5, 5],
  y: [0, 5, 7, 1, 7],
  z: [0, 7, 2, 4, 7],
  '-': [0, 0, 7, 0, 0],
  '.': [0, 0, 0, 0, 2],
  ':': [0, 2, 0, 2, 0],
  '/': [1, 1, 2, 4, 4],
  _: [0, 0, 0, 0, 7]
}

function glyphOf(ch: string): number[] {
  return GLYPH[ch.toLowerCase()] ?? [0, 0, 2, 0, 0]
}

export function rasterTail(text: string): { width: number; height: number; indices: Uint8Array } {
  const lines = text.replace(/\r/g, '').split('\n').slice(-ROWS)
  const width = COLS * CW
  const height = ROWS * CH
  const indices = new Uint8Array(width * height)
  lines.forEach((line, row) => {
    const chars = [...line].slice(0, COLS)
    chars.forEach((ch, col) => {
      const glyph = glyphOf(ch)
      for (let y = 0; y < 5; y++) {
        const bits = glyph[y] ?? 0
        for (let x = 0; x < 3; x++) {
          if ((bits & (1 << (2 - x))) === 0) continue
          const px = col * CW + x
          const py = row * CH + y
          indices[py * width + px] = 1
        }
      }
    })
  })
  return { width, height, indices }
}

class BitWriter {
  bytes: number[] = []
  private acc = 0
  private n = 0
  write(code: number, size: number) {
    this.acc |= (code & ((1 << size) - 1)) << this.n
    this.n += size
    while (this.n >= 8) {
      this.bytes.push(this.acc & 0xff)
      this.acc >>= 8
      this.n -= 8
    }
  }
  finish() {
    if (this.n > 0) this.bytes.push(this.acc & 0xff)
  }
}

function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const dict = new Map<string, number>()
  let codeSize = minCodeSize + 1
  let next = eoi + 1
  const reset = () => {
    dict.clear()
    for (let i = 0; i < clear; i++) dict.set(String.fromCharCode(i), i)
    codeSize = minCodeSize + 1
    next = eoi + 1
  }
  reset()
  const bits = new BitWriter()
  bits.write(clear, codeSize)
  if (!indices.length) {
    bits.write(eoi, codeSize)
    bits.finish()
    return bits.bytes
  }
  let phrase = String.fromCharCode(indices[0]!)
  for (let i = 1; i < indices.length; i++) {
    const k = String.fromCharCode(indices[i]!)
    const combined = phrase + k
    if (dict.has(combined)) {
      phrase = combined
      continue
    }
    bits.write(dict.get(phrase) ?? 0, codeSize)
    if (next < 4096) {
      dict.set(combined, next)
      next += 1
      if (next === 1 << codeSize && codeSize < 12) codeSize += 1
    } else {
      bits.write(clear, codeSize)
      reset()
    }
    phrase = k
  }
  bits.write(dict.get(phrase) ?? 0, codeSize)
  bits.write(eoi, codeSize)
  bits.finish()
  return bits.bytes
}

function subBlocks(data: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < data.length; i += 255) {
    const slice = data.slice(i, i + 255)
    out.push(slice.length, ...slice)
  }
  out.push(0)
  return out
}

export function encodeGif(width: number, height: number, frames: Array<{ indices: Uint8Array; delayCs: number }>): Uint8Array {
  const bytes: number[] = []
  const push = (...n: number[]) => {
    bytes.push(...n)
  }
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)
  push(width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255)
  push(0x80, 0, 0)
  push(0x0d, 0x11, 0x17, 0xc9, 0xd1, 0xd9)
  const netscape = 'NETSCAPE2.0'
  push(0x21, 0xff, 0x0b, ...[...netscape].map((c) => c.charCodeAt(0)), 0x03, 0x01, 0x00, 0x00, 0x00)
  const list = frames.length ? frames : [{ indices: new Uint8Array(width * height), delayCs: 10 }]
  for (const frame of list) {
    const delay = Math.max(1, Math.min(65535, Math.round(frame.delayCs)))
    push(0x21, 0xf9, 0x04, 0x00, delay & 255, (delay >> 8) & 255, 0x00, 0x00)
    push(0x2c, 0, 0, 0, 0, width & 255, (width >> 8) & 255, height & 255, (height >> 8) & 255, 0x00)
    push(2, ...subBlocks(lzwEncode(frame.indices, 2)))
  }
  push(0x3b)
  return Uint8Array.from(bytes)
}

export function gifFromTextFrames(frames: string[], delayCs = 50): Uint8Array {
  const rasters = frames.map((text) => rasterTail(text))
  const first = rasters[0] ?? rasterTail('')
  return encodeGif(
    first.width,
    first.height,
    rasters.map((frame) => ({ indices: frame.indices, delayCs }))
  )
}
