/** asciicast v2 encode, decode, and playback timing. */

export type CastHeader = {
  version: 2
  width: number
  height: number
  timestamp: number
  title?: string
  env?: Record<string, string>
}

export type CastEvent = { time: number; type: 'o' | 'i'; data: string }

export function encodeHeaderLine(header: CastHeader): string {
  return JSON.stringify({ ...header, version: 2 }) + '\n'
}

export function encodeEventLine(time: number, type: 'o' | 'i', data: string): string {
  const t = Math.max(0, Math.round(time * 1000) / 1000)
  return JSON.stringify([t, type, data]) + '\n'
}

export function encodeCast(header: CastHeader, events: CastEvent[]): string {
  return encodeHeaderLine(header) + events.map((e) => encodeEventLine(e.time, e.type, e.data)).join('')
}

export function decodeCast(text: string): { ok: true; header: CastHeader; events: CastEvent[] } | { ok: false; error: string } {
  const lines = text.split(/\n/).filter((l) => l.trim().length > 0)
  if (!lines.length) return { ok: false, error: 'empty' }
  let header: CastHeader
  try {
    const raw = JSON.parse(lines[0]!) as Partial<CastHeader>
    if (raw.version !== 2 || typeof raw.width !== 'number' || typeof raw.height !== 'number') return { ok: false, error: 'not-v2' }
    header = { version: 2, width: raw.width, height: raw.height, timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : 0, title: raw.title, env: raw.env }
  } catch {
    return { ok: false, error: 'not-v2' }
  }
  const events: CastEvent[] = []
  for (const line of lines.slice(1)) {
    try {
      const row = JSON.parse(line) as unknown
      if (!Array.isArray(row) || row.length < 3) return { ok: false, error: 'event' }
      const type = row[1]
      if (type !== 'o' && type !== 'i') continue
      events.push({ time: Number(row[0]) || 0, type, data: String(row[2]) })
    } catch {
      return { ok: false, error: 'event' }
    }
  }
  return { ok: true, header, events }
}

/** Compress idle gaps longer than 2s down to 0.5s. Times are seconds from the start of playback. */
export function playbackSchedule(events: CastEvent[], speed = 1, skipIdle = true): Array<{ at: number; data: string; type: 'o' | 'i' }> {
  const rate = speed > 0 ? speed : 1
  const out: Array<{ at: number; data: string; type: 'o' | 'i' }> = []
  let prev = 0
  let clock = 0
  for (const ev of events) {
    let gap = Math.max(0, ev.time - prev)
    if (skipIdle && gap > 2) gap = 0.5
    clock += gap / rate
    prev = ev.time
    out.push({ at: clock, data: ev.data, type: ev.type })
  }
  return out
}

export function castToText(events: CastEvent[]): string {
  return events.filter((e) => e.type === 'o').map((e) => e.data).join('')
}
