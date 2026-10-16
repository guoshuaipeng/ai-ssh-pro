/**
 * A-TFL: test-fail-fix loop for Core-A evals and npm test gates.
 *
 * A failing gate becomes a local explanation plus a patch draft. The draft is a
 * proposal until the human Agrees, using the same interrupt / resume phases as
 * command confirm. Decline writes nothing and stays a deny. A replan after
 * that deny drafts again from the original tree and the cite hold. It does
 * not treat the denied diff as the file, and it does not cite filler or a
 * rare token that existed only on the denied draft. Agree writes only through
 * the in-memory harness mock passed by the caller.
 *
 * No model call, no network, no filesystem, no child process. No Mastra or
 * LangGraph package. Secrets in the failure text are redacted in the explanation.
 */

import {
  createHitlLoop,
  interruptForProposal,
  markHitlExecuting,
  patchWritePermitted,
  redactSecrets,
  resumeHitl,
  sideEffectExecutionPermitted,
  type HitlLoopState
} from './core-a-context'
import { citeHeldAppliedWrite, citeHeldPatchDraft, rareMarkers, type CiteWindow } from './core-a-output-truncate'

export type GateFailure = {
  gate: string
  name: string
  message: string
  file?: string
  expected?: string
  actual?: string
}

export type PatchHunk = {
  path: string
  before: string
  after: string
}

export type PatchDraft = {
  id: string
  explanation: string
  summary: string
  hunks: PatchHunk[]
}

/** Confirm card fields the existing UX-64 command card already renders. */
export type PatchConfirmCard = {
  description: string
  notes: string
  command: string
  riskLevel: 'high'
  requestId: string
  autoApproved: false
}

export type MockTree = {
  read(path: string): string | undefined
  write(path: string, next: string): void
  snapshot(): Record<string, string>
  writeCount(): number
}

export type TflReview = {
  failure: GateFailure
  draft: PatchDraft
  hitl: HitlLoopState
}

export type ApplyResult = {
  tree: MockTree
  written: string[]
  applied: boolean
}

const MISSING = /missing|must contain|does not include|did not match|未包含|缺少|dropped/i
const STRICT = /strictly equal|not equal|toBe\(|to\.equal|===/i

export function createMockTree(files: Record<string, string>): MockTree {
  const data: Record<string, string> = { ...files }
  let writes = 0
  return {
    read: (path) => data[path],
    write: (path, next) => {
      writes += 1
      data[path] = next
    },
    snapshot: () => ({ ...data }),
    writeCount: () => writes
  }
}

/** Relative mock paths only. Absolute paths and `..` never enter a draft. */
export function isSafeMockPath(path: string): boolean {
  if (!path || path.length > 240) return false
  if (path.includes('\0') || path.includes('\\')) return false
  if (path.startsWith('/') || path.startsWith('~')) return false
  if (/^[A-Za-z]:/.test(path)) return false
  const parts = path.split('/')
  return parts.every((part) => part !== '' && part !== '.' && part !== '..')
}

function yamlScalar(text: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*${key}:\\s*(.*)$`, 'm').exec(text)
  if (!match) return undefined
  let raw = match[1]?.trim() ?? ''
  if (!raw || raw === '|-' || raw === '|') {
    const after = text.slice((match.index ?? 0) + match[0].length)
    const line = after.split('\n').find((row) => row.trim().length > 0)
    if (!line || !/^\s+/.test(line)) return undefined
    raw = line.trim()
  }
  if (
    (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) ||
    (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)
  ) {
    raw = raw.slice(1, -1)
  }
  return raw
}

/**
 * Read a node:test / npm test failure. Returns null when the text is not a
 * failing gate. Expected, actual, and file come from YAML-style lines.
 */
export function parseNpmTestFailure(output: string): GateFailure | null {
  const text = output.replace(/\r\n/g, '\n').trim()
  if (!text) return null
  if (!/not ok \d+|AssertionError|ERR_ASSERTION|# fail [1-9]/i.test(text)) return null
  const name =
    /^not ok \d+ - (.+)$/m.exec(text)?.[1]?.trim() ||
    /^# Subtest: (.+)$/m.exec(text)?.[1]?.trim() ||
    'npm test'
  const message =
    yamlScalar(text, 'error') ||
    /AssertionError(?: \[[^\]]+\])?: ([^\n]+)/.exec(text)?.[1]?.trim() ||
    name
  const file = yamlScalar(text, 'file')
  return {
    gate: 'npm-test',
    name: name.slice(0, 200),
    message: message.slice(0, 500),
    file: file ? file.slice(0, 300) : undefined,
    expected: yamlScalar(text, 'expected')?.slice(0, 500),
    actual: yamlScalar(text, 'actual')?.slice(0, 500)
  }
}

function clip(value: string | undefined, max: number): string {
  if (!value) return ''
  return redactSecrets(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Bilingual explanation. The draft is named as a proposal that has not been written. */
export function explainGateFailure(failure: GateFailure): string {
  const name = clip(failure.name, 200) || 'gate'
  const message = clip(failure.message, 500)
  const expected = clip(failure.expected, 200)
  const actual = clip(failure.actual, 200)
  const file = isSafeMockPath(failure.file?.trim() ?? '') ? clip(failure.file, 240) : ''
  const zh = [
    `评测失败：${name}。`,
    file ? `相关文件：${file}。` : '',
    expected ? `期望包含「${expected}」。` : '',
    actual ? `实际是「${actual}」。` : '',
    message ? `断言：${message}。` : '',
    '这是补丁草案，同意前不会写入任何文件。'
  ]
    .filter(Boolean)
    .join('')
  const en = [
    `Gate failed: ${name}.`,
    file ? `File: ${file}.` : '',
    expected ? `Expected "${expected}".` : '',
    actual ? `Actual "${actual}".` : '',
    message ? `Assertion: ${message}.` : '',
    'This is a patch draft. Nothing is written until you agree.'
  ]
    .filter(Boolean)
    .join(' ')
  return `${zh}\n${en}`
}

function insertFact(body: string, actual: string, expected: string): string {
  const fact = expected.endsWith('\n') ? expected : `${expected}\n`
  if (actual.endsWith('\n')) return body.replace(actual, `${actual}${fact}`)
  return body.replace(actual, `${actual}\n${fact}`)
}

function proposeHunks(failure: GateFailure, files: Record<string, string>): PatchHunk[] {
  const path = failure.file?.trim() ?? ''
  if (!isSafeMockPath(path)) return []
  const body = files[path]
  if (typeof body !== 'string') return []
  const expected = failure.expected?.trim() ?? ''
  const actual = failure.actual?.trim() ?? ''
  if (!expected || !actual || expected === actual) return []
  if (actual.length > 2000 || expected.length > 2000) return []
  if (body.split(actual).length !== 2) return []
  const strict = STRICT.test(failure.message)
  const missing = MISSING.test(failure.message)
  if (!strict && !missing) return []
  if (!strict && body.includes(expected)) return []
  const after = strict ? body.replace(actual, expected) : insertFact(body, actual, expected)
  if (after === body || !after.includes(expected)) return []
  return [{ path, before: body, after }]
}

function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned.slice(0, 40) || 'gate'
}

function unified(hunk: PatchHunk): string {
  const lines = (text: string): string[] => {
    const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text
    return trimmed.length === 0 ? [] : trimmed.split('\n')
  }
  return [
    `--- a/${hunk.path}`,
    `+++ b/${hunk.path}`,
    ...lines(hunk.before).map((line) => `-${line}`),
    ...lines(hunk.after).map((line) => `+${line}`)
  ].join('\n')
}

/**
 * Explain a gate and interrupt with a patch draft. Reads the mock tree and
 * does not write it. `autoApproveLowRisk` cannot skip the interrupt.
 * When the thread already holds a cite window, the draft cites those scarce
 * markers and does not cite filler that window dropped. The hunk that Agree
 * will write cites the same markers and drops that filler. Drafting does not
 * write the tree.
 */
export function reviewGateFailure(failure: GateFailure, tree: MockTree, hold?: CiteWindow | null): TflReview {
  const files = tree.snapshot()
  const explanation = citeHeldPatchDraft(explainGateFailure(failure), hold)
  const hunks = proposeHunks(failure, files).map((hunk) => ({
    ...hunk,
    after: citeHeldAppliedWrite(hunk.after, hold)
  }))
  const summary = hunks.length
    ? `草案：${hunks.map((hunk) => hunk.path).join(', ')}（同意前不写入） / Draft: ${hunks.map((hunk) => hunk.path).join(', ')} (not written until agree)`
    : '草案：仅说明，没有可安全套用的补丁（同意也不会写入） / Draft: explanation only; Agree still writes nothing'
  const draft: PatchDraft = {
    id: `tfl-${slug(failure.gate)}-${slug(failure.name)}`,
    explanation,
    summary,
    hunks
  }
  const hitl = interruptForProposal(createHitlLoop(), {
    action: 'patch',
    toolName: 'apply_patch',
    command: draft.summary,
    riskLevel: 'high',
    requestId: draft.id,
    autoApproveLowRisk: true
  })
  return { failure, draft, hitl }
}

export function reviewNpmTestFailure(output: string, tree: MockTree, hold?: CiteWindow | null): TflReview | null {
  const failure = parseNpmTestFailure(output)
  if (!failure) return null
  return reviewGateFailure(failure, tree, hold)
}

/** Shape a proposal the way a UX-64 confirm card already shows a command. */
export function patchDraftConfirmCard(review: TflReview): PatchConfirmCard {
  const command = review.draft.hunks.length
    ? review.draft.hunks.map(unified).join('\n')
    : review.draft.summary
  return {
    description: review.draft.explanation,
    notes: 'Agree writes this draft in the harness mock. Decline writes nothing.',
    command,
    riskLevel: 'high',
    requestId: review.hitl.requestId || review.draft.id,
    autoApproved: false
  }
}

/**
 * Write the draft only when the HITL gate is open. Otherwise the same tree
 * comes back and `write` is not called. A hunk that does not match the mock
 * file is refused as a whole: no partial write.
 */
export function applyPatchDraft(state: HitlLoopState, draft: PatchDraft, tree: MockTree): ApplyResult {
  if (!patchWritePermitted(state) || sideEffectExecutionPermitted(state) || draft.hunks.length === 0) {
    return { tree, written: [], applied: false }
  }
  for (const hunk of draft.hunks) {
    if (!isSafeMockPath(hunk.path)) return { tree, written: [], applied: false }
    if (tree.read(hunk.path) !== hunk.before) return { tree, written: [], applied: false }
    if (hunk.after === hunk.before) return { tree, written: [], applied: false }
  }
  const written: string[] = []
  for (const hunk of draft.hunks) {
    tree.write(hunk.path, hunk.after)
    written.push(hunk.path)
  }
  return { tree, written, applied: true }
}

/** Agree applies the draft to the mock. Decline leaves the mock untouched. */
export function decidePatch(review: TflReview, approved: boolean, tree: MockTree): ApplyResult & { state: HitlLoopState } {
  const resumed = resumeHitl(review.hitl, approved)
  if (resumed.phase !== 'resumed' || resumed.resume !== 'approve') {
    return { state: resumed, ...applyPatchDraft(resumed, review.draft, tree) }
  }
  const executing = markHitlExecuting(resumed)
  return { state: executing, ...applyPatchDraft(executing, review.draft, tree) }
}

export type DenyReplan = {
  /** The deny that was just recorded. It stays `cancelled` / `deny`, not a cancel. */
  denied: ApplyResult & { state: HitlLoopState }
  /** A new confirm-style draft. Its request id is not the denied one. */
  next: TflReview
  /** Cite window after the deny. Markers, filler, and `stable` are unchanged. */
  hold: CiteWindow | null
}

function cloneCiteHold(hold?: CiteWindow | null): CiteWindow | null {
  if (!hold) return null
  return {
    head: hold.head,
    tail: hold.tail,
    outsideHeadTail: [...hold.outsideHeadTail],
    droppedFiller: [...hold.droppedFiller],
    stable: hold.stable
  }
}

/**
 * Evidence the denied draft must not hand to the next one.
 * Dropped filler is never evidence, even when the untouched file still
 * contains it. A rare token is false evidence when it appears only on the
 * denied explanation or the denied after-bytes: not in the cite hold, and
 * not already in the file the deny left unchanged.
 */
export function deniedFalseEvidence(review: TflReview, hold?: CiteWindow | null): string[] {
  const held = new Set((hold?.outsideHeadTail ?? []).filter((token) => token.length > 0))
  const before = review.draft.hunks.map((hunk) => hunk.before).join('\n')
  const proposed = [review.draft.explanation, review.draft.summary, ...review.draft.hunks.map((hunk) => hunk.after)].join('\n')
  const invented = rareMarkers(proposed).filter((token) => !held.has(token) && !before.includes(token))
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of [...(hold?.droppedFiller ?? []), ...invented]) {
    if (!token || seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

function scrubFalseEvidence(text: string, tokens: readonly string[]): string {
  let out = text
  for (const token of tokens) {
    if (!token || !out.includes(token)) continue
    out = out.split(token).join('')
  }
  return out
}

function replanRequestId(deniedId: string | null, draftId: string): string {
  const base = (deniedId?.trim() || draftId || 'tfl-replan').slice(0, 180)
  const next = `${base}-replan`
  return next === deniedId ? `${base}-replan-2` : next
}

/**
 * Disagree, then draft again. The deny writes nothing and stays a deny.
 * The cite hold is not mutated. The next card is a new interrupt: it cites
 * held markers, drops filler the window already dropped, and does not inherit
 * rare tokens that existed only on the denied draft. The next `before` is the
 * file the deny left in place, not the denied after-bytes. Drafting does not
 * open an SSH write.
 */
export function replanAfterDeny(review: TflReview, tree: MockTree, hold?: CiteWindow | null): DenyReplan {
  const kept = cloneCiteHold(hold)
  const started = tree.snapshot()
  const denied = decidePatch(review, false, tree)
  const wrote = denied.applied || denied.written.length > 0
  const stillDenied = denied.state.phase === 'cancelled' && denied.state.resume === 'deny'
  const unchanged = JSON.stringify(tree.snapshot()) === JSON.stringify(started)
  if (!stillDenied || wrote || !unchanged) {
    return { denied, next: review, hold: kept }
  }
  const falseTokens = deniedFalseEvidence(review, kept)
  const drafted = reviewGateFailure(review.failure, tree, kept)
  const explanation = citeHeldPatchDraft(scrubFalseEvidence(drafted.draft.explanation, falseTokens), kept)
  const hunks = drafted.draft.hunks.map((hunk) => {
    const body = tree.read(hunk.path)
    return {
      ...hunk,
      before: typeof body === 'string' ? body : hunk.before,
      after: citeHeldAppliedWrite(scrubFalseEvidence(hunk.after, falseTokens), kept)
    }
  })
  const draft: PatchDraft = { ...drafted.draft, explanation, hunks }
  const hitl = interruptForProposal(createHitlLoop(), {
    action: 'patch',
    toolName: 'apply_patch',
    command: draft.summary,
    riskLevel: 'high',
    requestId: replanRequestId(review.hitl.requestId, draft.id),
    autoApproveLowRisk: true
  })
  return { denied, next: { ...drafted, draft, hitl }, hold: kept }
}

/**
 * Attach the unapplied explanation to a thrown gate error. The empty mock
 * means this path cannot form a hunk, and it never writes.
 */
export function annotateUnappliedFailure(error: unknown, failure: GateFailure): Error {
  const original = error instanceof Error ? error : new Error(String(error))
  try {
    const review = reviewGateFailure(failure, createMockTree({}))
    const applied = applyPatchDraft(review.hitl, review.draft, createMockTree({}))
    if (applied.applied || applied.written.length > 0) return original
    const annotated = new Error(`${original.message}\nA-TFL (not applied): ${review.draft.explanation}`)
    annotated.cause = original
    return annotated
  } catch {
    return original
  }
}
