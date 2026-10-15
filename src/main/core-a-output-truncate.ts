/**
 * A confirmed command can return a very long stdout, stderr, or ring.
 * The planner sees a capped view. A rare evidence token in the middle or
 * near the end stays in that view so a later end can cite it. A rare token
 * that was not in the output is not cited.
 *
 * Soft-batch pin: tipSuggest `0.4.8-s29`. Rollback is the S28 retry budget.
 */

/** Planner-visible cap for one command's stdout, stderr, or ring. */
export const OUTPUT_VIEW_CAP = 6000

/** Citeable truncate path. */
export const tipSuggest = '0.4.8-s29'

/** Previous batch this path rolls back to. */
export const rollback = '0.4.8-s28'

/** At least 8 characters, so ordinary words are not evidence tokens. */
const RARE_TOKEN = /[A-Z][A-Z0-9_]{7,}/g

export type OutputView = {
  text: string
  truncated: boolean
  originalChars: number
  shownChars: number
  cap: number
  /** Rare tokens from the original output, in first-seen order. */
  markers: string[]
  tipSuggest: typeof tipSuggest
  rollback: typeof rollback
}

/**
 * Production cap is 6000. `AISS_OUTPUT_VIEW_CAP` may only lower it so a
 * harness can reach the boundary. Invalid values and raises stay at the default.
 */
export function outputViewCap(): number {
  const raw = process.env.AISS_OUTPUT_VIEW_CAP?.trim()
  if (!raw) return OUTPUT_VIEW_CAP
  const n = Number(raw)
  if (!Number.isFinite(n)) return OUTPUT_VIEW_CAP
  const whole = Math.floor(n)
  if (whole < 240 || whole > OUTPUT_VIEW_CAP) return OUTPUT_VIEW_CAP
  return whole
}

export function emptyOutputView(): OutputView {
  return truncateCiteableOutput('')
}

export function rareMarkers(text: string): string[] {
  const found = text.match(new RegExp(RARE_TOKEN.source, 'g')) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of found) {
    if (seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

function headTailBudget(cap: number): { head: number; tail: number } {
  const slice = Math.min(800, Math.floor(cap * 0.35))
  return { head: slice, tail: slice }
}

function clipLineAround(line: string, token: string, max = 240): string {
  if (line.length <= max) return line
  const at = line.indexOf(token)
  if (at < 0) return line.slice(0, max)
  const start = Math.max(0, at - 40)
  return line.slice(start, start + max)
}

function finalize(text: string, markers: string[], cap: number): string {
  let out = text.length > cap ? text.slice(0, cap) : text
  for (const marker of markers) {
    if (out.includes(marker)) continue
    const addition = out ? `\n${marker}` : marker
    if (out.length + addition.length <= cap) {
      out += addition
      continue
    }
    const room = cap - addition.length
    const kept = room > 0 ? out.slice(0, room) : ''
    out = `${kept}${addition}`
    if (out.length > cap) out = out.slice(out.length - cap)
  }
  return out
}

/**
 * Identity when `raw` fits. Over the cap, keep a head, a tail, and every
 * rare-token line from the dropped middle. `shownChars` stays within `cap`.
 */
export function truncateCiteableOutput(raw: string, cap = outputViewCap()): OutputView {
  const markers = rareMarkers(raw)
  const base = {
    originalChars: raw.length,
    cap,
    markers,
    tipSuggest,
    rollback
  } as const
  if (raw.length <= cap) {
    return { ...base, text: raw, truncated: false, shownChars: raw.length }
  }
  const { head: headBudget, tail: tailBudget } = headTailBudget(cap)
  const middleStart = headBudget
  const middleEnd = Math.max(headBudget, raw.length - tailBudget)
  const middle = raw.slice(middleStart, middleEnd)
  const evidence: string[] = []
  for (const line of middle.split('\n')) {
    const tokens = rareMarkers(line)
    if (tokens.length === 0) continue
    const clipped = clipLineAround(line, tokens[0] ?? '')
    if (!evidence.includes(clipped)) evidence.push(clipped)
  }
  const headSlice = raw.slice(0, headBudget)
  const tailSlice = raw.slice(raw.length - tailBudget)
  for (const marker of markers) {
    if (headSlice.includes(marker) || tailSlice.includes(marker)) continue
    if (evidence.some((line) => line.includes(marker))) continue
    evidence.push(marker)
  }
  const notice = `…(output truncated, originalChars=${raw.length}, cap=${cap})`
  const evidenceBlock = evidence.join('\n')
  const fixed = [evidenceBlock, notice].filter(Boolean).join('\n')
  const room = cap - fixed.length - 2
  let text: string
  if (room < 40) {
    text = finalize([markers.join('\n'), notice].filter(Boolean).join('\n'), markers, cap)
  } else {
    const headTake = Math.min(headBudget, Math.floor(room / 2))
    const tailTake = Math.min(tailBudget, room - headTake)
    const head = raw.slice(0, headTake)
    const tail = raw.slice(raw.length - tailTake)
    text = finalize(`${head}\n${fixed}\n${tail}`, markers, cap)
  }
  return { ...base, text, truncated: true, shownChars: text.length }
}

/**
 * The end may cite rare tokens that were in the output. A rare token the
 * output never contained is removed. Missing preserved markers are appended
 * so the only evidence is not dropped. A view that was not truncated is unchanged.
 */
export function explainCiteableOutput(description: string, view: OutputView): string {
  if (!view.truncated) return description
  const allowed = new Set(view.markers)
  let text = description.replace(new RegExp(RARE_TOKEN.source, 'g'), (token) => (allowed.has(token) ? token : ''))
  for (const marker of view.markers) {
    if (!text.includes(marker)) text = `${text.trim()}\n${marker}`
  }
  return text
}
