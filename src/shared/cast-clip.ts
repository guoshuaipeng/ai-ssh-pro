/** L4c: clip a recording for export. The source events are never rewritten. */
import type { CastEvent } from './asciicast'

export const CLIP_GIF_MAX_SEC = 30

export function clipSpanSec(start: number, end: number): number {
  return Math.max(0, Math.max(start, end) - Math.min(start, end))
}

export function clampGifMax(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return CLIP_GIF_MAX_SEC
  return Math.max(5, Math.min(120, Math.round(n)))
}

export function clipGifAllowed(start: number, end: number, maxSec = CLIP_GIF_MAX_SEC): boolean {
  const span = clipSpanSec(start, end)
  return span > 0 && span <= clampGifMax(maxSec) + 0.001
}

/** Copy of the events inside [start, end], rebased to t=0. Input objects stay as they were. */
export function clipCastEvents(events: readonly CastEvent[], start: number, end: number): CastEvent[] {
  const from = Math.max(0, Math.min(start, end))
  const to = Math.max(from, Math.max(start, end))
  return events
    .filter((ev) => ev.time >= from - 1e-6 && ev.time <= to + 1e-6)
    .map((ev) => ({
      time: Math.max(0, Math.round((ev.time - from) * 1000) / 1000),
      type: ev.type,
      data: ev.data
    }))
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
}

export function formatClipClock(sec: number): string {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  const whole = Math.floor(rest)
  const frac = Math.min(999, Math.round((rest - whole) * 1000))
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(m)}:${pad(whole)}.${pad(frac, 3)}`
}

export function clipMarkdown(opts: {
  title: string
  start: number
  end: number
  events: readonly CastEvent[]
  includeText: boolean
}): string {
  const from = Math.min(opts.start, opts.end)
  const to = Math.max(opts.start, opts.end)
  const clip = clipCastEvents(opts.events, from, to)
  const lines = [`# ${opts.title}`, '', `- ${formatClipClock(from)} – ${formatClipClock(to)}`, '']
  for (const ev of clip) {
    if (ev.type !== 'o') continue
    const clock = formatClipClock(from + ev.time)
    if (!opts.includeText) {
      lines.push(`- ${clock}`)
      continue
    }
    const text = stripAnsi(ev.data).replace(/\s+/g, ' ').trim()
    if (!text) continue
    lines.push(`- ${clock} ${text}`)
  }
  return lines.join('\n')
}

/** One text snapshot per frame, using original cast time. */
export function clipFrames(events: readonly CastEvent[], start: number, end: number, fps = 2, maxFrames = 60): string[] {
  const clip = clipCastEvents(events, start, end)
  const span = clipSpanSec(start, end)
  const n = Math.max(1, Math.min(maxFrames, Math.ceil(Math.max(span, 0.001) * fps)))
  const frames: string[] = []
  for (let i = 0; i < n; i++) {
    const t = span <= 0 ? 0 : (span * i) / n
    let acc = ''
    for (const ev of clip) {
      if (ev.time > t + 1e-6) break
      if (ev.type === 'o') acc += ev.data
    }
    frames.push(stripAnsi(acc))
  }
  return frames
}
