/**
 * A confirmed command can return a very long stdout, stderr, or ring.
 * The planner sees a capped view. A rare evidence token in the middle or
 * near the end stays in that view so a later end can cite it. A rare token
 * that was not in the output is not cited.
 *
 * Under observational compression the same window stays stable: a scarce
 * marker outside the naive head cut remains in the bullet, and filler that
 * the cite window dropped does not come back as a cite. A later compression
 * in the same thread keeps that hold. A later test-fail-fix patch draft on
 * that thread still cites the held marker and does not cite the dropped filler.
 * Agreeing that draft writes the same cite: the applied bytes still name the
 * held marker, and filler that window already dropped is not written back.
 *
 * Soft-batch pin: tipSuggest `0.4.8-s33`. Rollback is the S32 cite on the draft.
 */

/** Planner-visible cap for one command's stdout, stderr, or ring. */
export const OUTPUT_VIEW_CAP = 6000

/** Citeable truncate path. */
export const tipSuggest = '0.4.8-s33'

/** Previous batch this path rolls back to. */
export const rollback = '0.4.8-s32'

/** At least 8 characters, so ordinary words are not evidence tokens. */
const RARE_TOKEN = /[A-Z][A-Z0-9_]{7,}/g

/** Hyphenated filler in a dropped middle line. Not a rare evidence token. */
const FILLER_TOKEN = /[a-z][a-z0-9]+(?:-[a-z0-9]+)+/g

/**
 * Cite-window boundary. `outsideHeadTail` are scarce markers a naive head
 * or tail cut would lose. `droppedFiller` must not be cited. `stable` means
 * every scarce marker is in the kept text and no dropped filler is.
 */
export type CiteWindow = {
  head: number
  tail: number
  outsideHeadTail: string[]
  droppedFiller: string[]
  stable: boolean
}

export type OutputView = {
  text: string
  truncated: boolean
  originalChars: number
  shownChars: number
  cap: number
  /** Rare tokens from the original output, in first-seen order. */
  markers: string[]
  /** Boundary of this truncate. Inspectable on the context debug event. */
  citeWindow: CiteWindow
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

export function emptyCiteWindow(): CiteWindow {
  return { head: 0, tail: 0, outsideHeadTail: [], droppedFiller: [], stable: true }
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

function uniqueTokens(tokens: string[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of tokens) {
    if (!token || seen.has(token)) continue
    seen.add(token)
    out.push(token)
    if (out.length >= limit) break
  }
  return out
}

/** Filler tokens on middle lines that carry no rare marker. Capped for the debug event. */
export function droppedFillerTokens(raw: string, cap = outputViewCap()): string[] {
  if (raw.length <= cap) return []
  const { head, tail } = headTailBudget(cap)
  const middle = raw.slice(head, Math.max(head, raw.length - tail))
  const found: string[] = []
  for (const line of middle.split('\n')) {
    if (rareMarkers(line).length > 0) continue
    found.push(...(line.match(new RegExp(FILLER_TOKEN.source, 'g')) ?? []))
  }
  return uniqueTokens(
    found.filter((token) => token.length >= 8),
    8
  )
}

/**
 * One observational line under a naive head cut. Returns null when every
 * rare marker already sits in that head, so ordinary short turns stay as
 * they were. Otherwise the line is the scarce markers only: filler the cite
 * window dropped is not copied back in.
 */
export function citeObservationLine(raw: string, maxChars: number): { text: string; cite: CiteWindow } | null {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (!collapsed || collapsed.length <= maxChars) return null
  const naive = collapsed.slice(0, Math.max(0, maxChars))
  const dropped = droppedFillerTokens(raw)
  const scarce = rareMarkers(collapsed).filter((marker) => !naive.includes(marker) && !dropped.includes(marker))
  if (scarce.length === 0) return null
  const fit: string[] = []
  for (const marker of scarce) {
    const next = fit.length ? `${fit.join(' ')} ${marker}` : marker
    if (next.length > maxChars) break
    fit.push(marker)
  }
  if (fit.length === 0) return null
  const text = fit.join(' ')
  return {
    text,
    cite: {
      head: maxChars,
      tail: 0,
      outsideHeadTail: fit,
      droppedFiller: dropped,
      stable: fit.every((marker) => text.includes(marker)) && dropped.every((filler) => !text.includes(filler))
    }
  }
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
    return { ...base, text: raw, truncated: false, shownChars: raw.length, citeWindow: emptyCiteWindow() }
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
  const outsideHeadTail = markers.filter((marker) => !headSlice.includes(marker) && !tailSlice.includes(marker))
  const droppedFiller = droppedFillerTokens(raw, cap)
  const citeWindow: CiteWindow = {
    head: headBudget,
    tail: tailBudget,
    outsideHeadTail,
    droppedFiller,
    stable:
      outsideHeadTail.every((marker) => text.includes(marker)) && droppedFiller.every((filler) => !text.includes(filler))
  }
  return { ...base, text, truncated: true, shownChars: text.length, citeWindow }
}

/**
 * The end may cite rare tokens that were in the output or held from an
 * earlier cite window. A rare token the output never contained is removed.
 * Filler the cite window dropped is removed, including when a later
 * observational compression still holds that window. Missing preserved markers
 * are appended only for a truncated live view. A short view with no hold
 * is unchanged.
 */
export function explainCiteableOutput(description: string, view: OutputView, hold?: CiteWindow | null): string {
  const holdActive = Boolean(hold && (hold.outsideHeadTail.length > 0 || hold.droppedFiller.length > 0))
  if (!view.truncated && !holdActive) return description
  const allowed = new Set<string>([...view.markers, ...(hold?.outsideHeadTail ?? [])])
  let text = description.replace(new RegExp(RARE_TOKEN.source, 'g'), (token) => (allowed.has(token) ? token : ''))
  const dropped = new Set<string>([...view.citeWindow.droppedFiller, ...(hold?.droppedFiller ?? [])])
  for (const filler of dropped) {
    if (filler) text = text.split(filler).join('')
  }
  if (view.truncated) {
    for (const marker of view.markers) {
      if (!text.includes(marker)) text = `${text.trim()}\n${marker}`
    }
  }
  return text
}

const PATCH_DRAFT = /补丁草案|patch draft/i

/**
 * A confirm-style patch draft on a thread that already holds a cite window.
 * Held scarce markers are cited even when the failure text omitted them.
 * Filler that window already dropped is not cited. A description that is not
 * a patch draft is unchanged, so ordinary ends do not grow a marker.
 */
export function citeHeldPatchDraft(description: string, hold?: CiteWindow | null): string {
  if (!hold) return description
  if (hold.outsideHeadTail.length === 0 && hold.droppedFiller.length === 0) return description
  if (!PATCH_DRAFT.test(description)) return description
  let text = explainCiteableOutput(description, emptyOutputView(), hold)
  for (const marker of hold.outsideHeadTail) {
    if (marker && !text.includes(marker)) text = `${text.trim()}\n${marker}`
  }
  return text
}

/**
 * Bytes written when a confirm-style patch is agreed on a thread that already
 * holds a cite window. Held scarce markers are cited even when the hunk omitted
 * them. Filler that window already dropped is removed, so it is not cited again.
 * A body with no hold is unchanged. The hold itself is not mutated.
 */
export function citeHeldAppliedWrite(body: string, hold?: CiteWindow | null): string {
  if (!hold) return body
  if (hold.outsideHeadTail.length === 0 && hold.droppedFiller.length === 0) return body
  let text = body
  for (const filler of hold.droppedFiller) {
    if (filler) text = text.split(filler).join('')
  }
  for (const marker of hold.outsideHeadTail) {
    if (marker && !text.includes(marker)) text = `${text.replace(/\s+$/g, '')}\n${marker}\n`
  }
  return text
}
