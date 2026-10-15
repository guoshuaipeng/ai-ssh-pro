/**
 * Core-A context assembly, adapted into the existing planner loop:
 * - Mastra Memory: working memory every turn, a last-N transcript window, and recall
 *   (keyword + overlap stand in for semantic recall until an embedder exists).
 * - Observational memory: older turns compress into fact bullets and are injected
 *   into the planner. Extractive and local — no Mastra package and no extra model call.
 * - LangGraph-style HITL: confirm / interrupt / resume are explicit loop phases.
 *   SSH and other risky tools stay gated; risk level never auto-runs them.
 *   A `patch` proposal (A-TFL) uses the same interrupt and cannot take the SSH write path.
 * - Graphorin: working tier (current task) vs session transcript vs episodic recall,
 *   fused with Reciprocal Rank Fusion (k=60).
 * - Vercel AI SDK ToolLoopAgent: needsApproval for side-effecting tools.
 *
 * Compaction is extractive and local: no extra model call and no network.
 * `recallEpisodes(..., { embedding })` accepts a third rank list so a vector
 * retriever can be fused later without changing the prompt shape.
 */

import { randomUUID } from 'node:crypto'
import { citeObservationLine, type CiteWindow } from './core-a-output-truncate'

export type WorkingStatus = 'active' | 'blocked' | 'done'

/**
 * Mastra-style working scratchpad. One current-task block per thread.
 * `hostFacts` are structured and host-scoped. They are not observational
 * bullets, so a bullet cap cannot drop them.
 */
export type WorkingMemoryBlock = {
  id: 'current_task'
  goal: string
  constraints: string[]
  /** Rare host tokens (ids, addresses, paths) kept beside the active goal. */
  hostFacts: string[]
  successCriteria?: string
  status: WorkingStatus
  updatedAt: number
}

/**
 * One observational-memory bullet compressed from a turn that left the live window.
 * In-repo extractive observer (Mastra-style). Not a vendored SDK type.
 */
export type ObservationBullet = {
  id: string
  text: string
  createdAt: number
}

/** Durable summary of turns that left the live window, or of one planner step. */
export type EpisodicSummary = {
  id: string
  text: string
  tags: string[]
  sourceChars: number
  createdAt: number
  /**
   * Reserved for a future embedder. Unused by v1 ranking.
   * A vector index can read this without a schema change.
   */
  embedding?: number[]
}

export type ThreadContext = {
  workingMemory: WorkingMemoryBlock | null
  episodes: EpisodicSummary[]
  /** Extractive summary of transcript already outside the live window. */
  runningSummary: string
  /**
   * Dense bullets for turns outside the live window. Kept even when
   * `runningSummary` drops the middle to stay under its character cap.
   */
  observationalMemory: ObservationBullet[]
  /** Fingerprint of the last message folded into `runningSummary`. */
  compactedCursor: string | null
  /** Cumulative budget loss for this thread. Not shared across hosts. */
  omBudget?: OmBudgetMark
  /**
   * Cite window held after observational compression, and after a later
   * re-compression of the same thread. Scarce markers stay citeable; filler
   * the cite window already dropped must not come back. Not shared across hosts.
   */
  citeHold?: CiteWindow
}

export type TranscriptTurn = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type RecallSignal = 'keyword' | 'overlap' | 'embedding'

export type RecallHit = {
  id: string
  text: string
  score: number
  signals: RecallSignal[]
  tags: string[]
  createdAt: number
}

export type ContextSliceName = 'working' | 'observations' | 'runningSummary' | 'recall' | 'recentWindow' | 'system'

export type ContextSlice = {
  name: ContextSliceName
  chars: number
  items?: number
}

/**
 * Sticky observational-memory loss for one thread.
 * Absent counters mean nothing has been dropped or cut yet.
 * The mark stays on the thread that recorded it, so another host does not inherit it.
 */
export type OmBudgetMark = {
  /** Bullets removed because the list cap was exceeded. */
  droppedBullets: number
  /** Bullets whose source line or stored text was cut to a character cap. */
  truncatedBullets: number
  /** Running summary was cut to the summary character cap. */
  summaryTruncated: boolean
}

/**
 * Eval-assertable observational-memory budget.
 * `truncated` is a loss (drop, per-bullet cut, or summary cap).
 * `nearBudget` means the bullet list or the summary is at least 80% of its cap.
 */
export type OmBudgetSignal = OmBudgetMark & {
  bulletCap: number
  bulletCharCap: number
  summaryCharCap: number
  bullets: number
  bulletChars: number
  summaryChars: number
  nearBudget: boolean
  truncated: boolean
}

export const EMPTY_THREAD: ThreadContext = {
  workingMemory: null,
  episodes: [],
  runningSummary: '',
  observationalMemory: [],
  compactedCursor: null
}

const MAX_EPISODES = 40
const MAX_SUMMARY_CHARS = 1500
const MAX_EPISODE_CHARS = 500
const MAX_OBSERVATION_BULLETS = 40
const MAX_OBSERVATION_CHARS = 180
/** Share of a cap that counts as near the observational-memory boundary. */
const OM_NEAR_BUDGET_RATIO = 0.8

/**
 * Production bullet cap is 40. `AISS_OM_BULLET_CAP` may only lower it so a
 * harness can reach the boundary. Invalid values stay at the default.
 */
export function observationBulletCap(): number {
  const raw = process.env.AISS_OM_BULLET_CAP?.trim()
  if (!raw) return MAX_OBSERVATION_BULLETS
  const n = Number(raw)
  if (!Number.isFinite(n)) return MAX_OBSERVATION_BULLETS
  const whole = Math.floor(n)
  if (whole < 2 || whole > MAX_OBSERVATION_BULLETS) return MAX_OBSERVATION_BULLETS
  return whole
}

export function emptyOmBudget(): OmBudgetMark {
  return { droppedBullets: 0, truncatedBullets: 0, summaryTruncated: false }
}

/** Lengths and caps for the current thread, plus any sticky loss already recorded. */
export function observeOmBudget(ctx: ThreadContext): OmBudgetSignal {
  const mark = ctx.omBudget ?? emptyOmBudget()
  const bulletCap = observationBulletCap()
  const bullets = ctx.observationalMemory.length
  const bulletChars = ctx.observationalMemory.reduce((sum, bullet) => sum + bullet.text.length, 0)
  const summaryChars = ctx.runningSummary.length
  const truncated = mark.droppedBullets > 0 || mark.truncatedBullets > 0 || mark.summaryTruncated
  const nearBudget =
    bullets / bulletCap >= OM_NEAR_BUDGET_RATIO || summaryChars / MAX_SUMMARY_CHARS >= OM_NEAR_BUDGET_RATIO
  return {
    droppedBullets: mark.droppedBullets,
    truncatedBullets: mark.truncatedBullets,
    summaryTruncated: mark.summaryTruncated,
    bulletCap,
    bulletCharCap: MAX_OBSERVATION_CHARS,
    summaryCharCap: MAX_SUMMARY_CHARS,
    bullets,
    bulletChars,
    summaryChars,
    nearBudget,
    truncated
  }
}
const RRF_K = 60
const DEFAULT_TOP_K = 5
const DEFAULT_MAX_TURNS = 8

/** Tool names that would run a shell even if the model labels them tool_call. */
const RISKY_TOOL_NAMES = new Set(['ssh_exec', 'shell', 'run_command', 'exec', 'raw_ssh', 'system_command'])

const STOP = new Set([
  'the', 'and', 'for', 'you', 'this', 'that', 'with', 'from', 'what', 'why', 'how',
  'please', 'check', 'a', 'an', 'to', 'of', 'in', 'on', 'is', 'it', 'or', 'be'
])

const EXPLICIT_GOAL_SWITCH =
  /换个问题|换个话题|换一个问题|另问|另外一个问题|新问题|新的问题|先不管|别管刚才|不要管刚才|重新开始|new problem|another (?:question|problem|task)|different (?:question|topic|task)|switch topics?|start over|forget (?:that|the previous)|^\s*另外[，,：:\s]/i

const FOLLOW_UP =
  /^(?:继续|接着|然后|再看|再查|下一步|上面|刚才|这个|那个|continue\b|go on\b|next\b|still\b|same\b)/i

export function resolveThreadId(input: {
  historyKey?: string | null
  targetSessionId?: string | null
}): string {
  return input.historyKey?.trim() || input.targetSessionId?.trim() || 'global'
}

/**
 * SSH `command` writes and A-TFL `patch` drafts are side effects and must pause
 * for confirmation. Read-only tool calls (terminal snapshot, inventory reads/writes
 * to the local knowledge base) do not. Risk level never bypasses this.
 * Named SSH-like tools stay gated even when the model wraps them as tool_call.
 * A patch draft is not an SSH command: agreeing to it does not open the SSH write path.
 */
export function actionNeedsHumanInterrupt(action: string, toolName?: string | null): boolean {
  if (action === 'command' || action === 'patch') return true
  if (action !== 'tool_call') return false
  return RISKY_TOOL_NAMES.has((toolName ?? '').trim().toLowerCase())
}

/** Always false. `autoApproveLowRisk` must not skip the confirm interrupt. */
export function confirmBypassAllowed(_autoApproveLowRisk?: boolean): false {
  return false
}

export type HitlPhase = 'planning' | 'interrupted' | 'resumed' | 'executing' | 'observing' | 'cancelled' | 'done'

/** Explicit confirm / interrupt / resume state for one planner step. */
export type HitlLoopState = {
  phase: HitlPhase
  requestId: string | null
  action: string | null
  toolName: string | null
  command: string | null
  riskLevel: string | null
  resume: 'approve' | 'deny' | null
}

export function createHitlLoop(): HitlLoopState {
  return {
    phase: 'planning',
    requestId: null,
    action: null,
    toolName: null,
    command: null,
    riskLevel: null,
    resume: null
  }
}

export type HitlProposal = {
  action: string
  toolName?: string | null
  command?: string | null
  riskLevel?: string | null
  requestId?: string | null
  /** Accepted and ignored. Low-risk SSH commands still interrupt. */
  autoApproveLowRisk?: boolean
}

/**
 * LangGraph-style interrupt. A risky proposal enters `interrupted` and must
 * not execute. Read-only tools enter `executing` with no resume token.
 * Each planner step starts from `createHitlLoop()`.
 */
export function interruptForProposal(_state: HitlLoopState, proposal: HitlProposal): HitlLoopState {
  void proposal.autoApproveLowRisk
  if (actionNeedsHumanInterrupt(proposal.action, proposal.toolName)) {
    return {
      phase: 'interrupted',
      requestId: proposal.requestId?.trim() || null,
      action: proposal.action,
      toolName: proposal.toolName?.trim() || null,
      command: proposal.command?.trim() || null,
      riskLevel: proposal.riskLevel?.trim() || null,
      resume: null
    }
  }
  if (proposal.action === 'end') {
    return {
      phase: 'done',
      requestId: null,
      action: 'end',
      toolName: null,
      command: null,
      riskLevel: null,
      resume: null
    }
  }
  return {
    phase: 'executing',
    requestId: null,
    action: proposal.action,
    toolName: proposal.toolName?.trim() || null,
    command: null,
    riskLevel: null,
    resume: null
  }
}

/** Human decision. Only an `interrupted` step can resume or deny. Deny stays `cancelled`. */
export function resumeHitl(state: HitlLoopState, approved: boolean): HitlLoopState {
  if (state.phase !== 'interrupted') return state
  if (!approved) return { ...state, phase: 'cancelled', resume: 'deny' }
  return { ...state, phase: 'resumed', resume: 'approve' }
}

/**
 * User cancelled the interrupt. This is not a deny: the proposal is dropped
 * and the loop returns to `planning` so the next turn can replan. A denied
 * step stays `cancelled` and is not rewritten.
 */
export function cancelHitl(state: HitlLoopState): HitlLoopState {
  if (state.phase !== 'interrupted') return state
  return createHitlLoop()
}

/** True when no interrupt is held: planning, with no request, command, or resume token. */
export function hitlIsPlannable(state: HitlLoopState): boolean {
  return (
    state.phase === 'planning' &&
    state.resume == null &&
    state.requestId == null &&
    state.command == null &&
    state.action == null
  )
}

/** Move `resumed` + approve into `executing`. Any other phase stays put. */
export function markHitlExecuting(state: HitlLoopState): HitlLoopState {
  if (state.phase !== 'resumed' || state.resume !== 'approve') return state
  return { ...state, phase: 'executing' }
}

export function markHitlObserving(state: HitlLoopState): HitlLoopState {
  if (state.phase !== 'executing') return state
  return { ...state, phase: 'observing' }
}

/**
 * SSH writes may run only after interrupt → approve → executing, and only for
 * a `command`. Read-only tools never satisfy this, so they cannot take the write path.
 * An empty command still has to pass this gate; the caller rejects the empty text.
 */
export function sideEffectExecutionPermitted(state: HitlLoopState): boolean {
  return state.phase === 'executing' && state.resume === 'approve' && state.action === 'command'
}

/**
 * A source patch may be written only after interrupt → approve → executing,
 * and only for a `patch` proposal. Decline, an interrupted draft, and an SSH
 * command never satisfy this. Callers still have to match the draft against
 * the harness mock; this gate does not touch the filesystem.
 */
export function patchWritePermitted(state: HitlLoopState): boolean {
  return state.phase === 'executing' && state.resume === 'approve' && state.action === 'patch'
}

export function redactSecrets(raw: string): string {
  return raw
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[redacted-key]')
    .replace(/\b(api[_-]?key|token|password|passwd|secret)\b\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
}

export function contentTokens(text: string): string[] {
  const out: string[] = []
  const lower = text.toLowerCase()
  for (const word of lower.match(/[a-z0-9_./:-]{2,}/g) ?? []) {
    if (!STOP.has(word)) out.push(word)
  }
  for (const run of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length === 1) out.push(run)
    else {
      for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2))
    }
  }
  return out
}

function collapse(text: string, max: number): string {
  const t = redactSecrets(text).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return t.slice(0, max)
}

function extractConstraints(text: string): string[] {
  const hits: string[] = []
  const re = /(?:不要|禁止|不能|务必不要|do not|don't|never|must not)\s*([^。\n]{1,60})/gi
  for (const match of text.matchAll(re)) {
    const line = collapse(match[0] ?? '', 80)
    if (line && !hits.includes(line)) hits.push(line)
    if (hits.length >= 6) break
  }
  return hits
}

function extractSuccess(text: string): string | undefined {
  const match = text.match(/(?:成功标准|完成条件|算完成|success criteria|done when)\s*[:：]?\s*([^\n。]{2,80})/i)
  const value = match?.[1]?.trim()
  return value ? collapse(value, 80) : undefined
}

const MAX_HOST_FACTS = 8

/**
 * Concrete host tokens only: rare identifiers, addresses, and paths.
 * Narrative filler does not become a host fact, and later filler does not
 * evict an earlier fact once the scratchpad is full.
 */
function extractHostFacts(text: string): string[] {
  const hits: string[] = []
  const add = (raw: string) => {
    const line = collapse(raw, 80).replace(/[，,。.;；:：]+$/g, '')
    if (!line || hits.includes(line)) return
    hits.push(line)
  }
  for (const match of text.matchAll(/\b[A-Z][A-Z0-9_]{4,}\b/g)) add(match[0] ?? '')
  for (const match of text.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g)) add(match[0] ?? '')
  for (const match of text.matchAll(/\/[\w./-]{3,}/g)) add(match[0] ?? '')
  return hits.slice(0, MAX_HOST_FACTS)
}

function mergeHostFacts(existing: string[], text: string): string[] {
  const next = existing.filter((fact) => fact.trim()).slice(0, MAX_HOST_FACTS)
  for (const fact of extractHostFacts(text)) {
    if (next.includes(fact)) continue
    if (next.length >= MAX_HOST_FACTS) break
    next.push(fact)
  }
  return next
}

function seedBlock(text: string, now: number): WorkingMemoryBlock {
  const goal = collapse(text, 200)
  const success = extractSuccess(text)
  return {
    id: 'current_task',
    goal: goal || text.trim().slice(0, 200),
    constraints: extractConstraints(text),
    hostFacts: extractHostFacts(text),
    ...(success ? { successCriteria: success } : {}),
    status: 'active',
    updatedAt: now
  }
}

/** Fold a follow-up into the scratchpad without replacing the active goal. */
function applyUtterance(block: WorkingMemoryBlock, utterance: string, now: number): WorkingMemoryBlock {
  const constraints = mergeConstraints(block.constraints, utterance)
  const hostFacts = mergeHostFacts(block.hostFacts, utterance)
  const success = block.successCriteria ?? extractSuccess(utterance)
  const status: WorkingStatus = block.status === 'done' ? 'active' : block.status
  if (
    status === block.status &&
    constraints.length === block.constraints.length &&
    hostFacts.length === block.hostFacts.length &&
    success === block.successCriteria
  ) {
    return block
  }
  return {
    ...block,
    constraints,
    hostFacts,
    ...(success ? { successCriteria: success } : {}),
    status,
    updatedAt: now
  }
}

export function shouldReplaceGoal(currentGoal: string, nextUtterance: string): boolean {
  const next = nextUtterance.trim()
  const current = currentGoal.trim()
  if (!next || !current) return false
  // The stored goal is the utterance itself, so a retry of the same message must not archive it again.
  if (current === collapse(next, 200)) return false
  if (EXPLICIT_GOAL_SWITCH.test(next)) return true
  if (FOLLOW_UP.test(next)) return false
  if (next.length < 8) return false
  if (current.includes(next) || next.includes(current)) return false
  const goalTokens = new Set(contentTokens(current))
  const nextTokens = contentTokens(next)
  if (nextTokens.length < 2 || goalTokens.size === 0) return false
  const shared = nextTokens.filter((token) => goalTokens.has(token)).length
  return shared / nextTokens.length < 0.2
}

function firstUserText(turns: Array<{ role: string; content: string }>): string {
  for (const turn of turns) {
    if (turn.role === 'user' && turn.content.trim()) return turn.content.trim()
  }
  return ''
}

function lastUserText(turns: Array<{ role: string; content: string }>): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]
    if (turn && turn.role === 'user' && turn.content.trim()) return turn.content.trim()
  }
  return ''
}

function mergeConstraints(existing: string[], text: string): string[] {
  const next = [...existing]
  for (const line of extractConstraints(text)) {
    if (!next.includes(line)) next.push(line)
  }
  return next.slice(-6)
}

export function formatArchivedGoal(goal: string): { note: string; taskSummary: string } {
  const g = collapse(goal, 180)
  return { note: `archived-goal: ${g}`, taskSummary: `[done] ${g}` }
}

/**
 * Seed working memory from the first user turn. If the latest utterance is a
 * different task, archive the seeded goal (Graphorin block rethink).
 */
export function absorbUserTurn(
  ctx: ThreadContext,
  history: Array<{ role: string; content: string }>,
  now = Date.now()
): { ctx: ThreadContext; switchedFrom: WorkingMemoryBlock | null } {
  const first = firstUserText(history)
  const latest = lastUserText(history)
  let next = ctx
  let switchedFrom: WorkingMemoryBlock | null = null

  if (!next.workingMemory) {
    const seedFrom = first || latest
    if (!seedFrom) return { ctx: next, switchedFrom: null }
    let seeded = seedBlock(seedFrom, now)
    next = { ...next, workingMemory: seeded }
    if (latest && latest !== seedFrom && shouldReplaceGoal(seeded.goal, latest)) {
      switchedFrom = seeded
      next = replaceGoal(next, latest, now)
      return { ctx: next, switchedFrom }
    }
    if (latest && latest !== seedFrom) {
      seeded = applyUtterance(seeded, latest, now)
      next = { ...next, workingMemory: seeded }
    }
    return { ctx: next, switchedFrom }
  }

  if (!latest) return { ctx: next, switchedFrom: null }

  if (shouldReplaceGoal(next.workingMemory.goal, latest)) {
    switchedFrom = next.workingMemory
    next = replaceGoal(next, latest, now)
    return { ctx: next, switchedFrom }
  }

  const updated = applyUtterance(next.workingMemory, latest, now)
  if (updated === next.workingMemory) return { ctx: next, switchedFrom: null }
  return { ctx: { ...next, workingMemory: updated }, switchedFrom: null }
}

function replaceGoal(ctx: ThreadContext, utterance: string, now: number): ThreadContext {
  const previous = ctx.workingMemory
  const archived = previous ? formatArchivedGoal(previous.goal) : null
  const episode = archived
    ? createEpisode({
        text: archived.note,
        tags: ['working-memory', 'archived-goal', ...inferTags(previous?.goal ?? '')],
        sourceChars: previous?.goal.length ?? 0,
        now
      })
    : null
  let episodes = ctx.episodes
  if (episode) episodes = appendEpisode({ ...ctx, episodes }, episode).episodes
  const seeded = seedBlock(utterance, now)
  return {
    ...ctx,
    episodes,
    workingMemory: {
      ...seeded,
      hostFacts: mergeHostFacts(previous?.hostFacts ?? [], utterance)
    }
  }
}

export function markWorkingStatus(ctx: ThreadContext, status: WorkingStatus, now = Date.now()): ThreadContext {
  if (!ctx.workingMemory || ctx.workingMemory.status === status) return ctx
  return {
    ...ctx,
    workingMemory: { ...ctx.workingMemory, status, updatedAt: now }
  }
}

export function inferTags(text: string): string[] {
  const tags: string[] = []
  for (const token of contentTokens(text)) {
    if (token.length < 2) continue
    if (!tags.includes(token)) tags.push(token)
    if (tags.length >= 6) break
  }
  return tags
}

export function createEpisode(input: {
  text: string
  tags?: string[]
  sourceChars?: number
  now?: number
}): EpisodicSummary {
  const text = collapse(input.text, MAX_EPISODE_CHARS)
  return {
    id: randomUUID(),
    text,
    tags: (input.tags ?? inferTags(text)).slice(0, 8),
    sourceChars: input.sourceChars ?? input.text.length,
    createdAt: input.now ?? Date.now()
  }
}

function isDurableEpisode(episode: EpisodicSummary): boolean {
  return episode.tags.includes('compaction') || episode.tags.includes('archived-goal')
}

export function appendEpisode(ctx: ThreadContext, episode: EpisodicSummary): ThreadContext {
  const text = episode.text.trim()
  if (!text) return ctx
  if (ctx.episodes.some((item) => item.text.trim() === text)) return ctx
  const episodes = [...ctx.episodes, { ...episode, text }]
  if (episodes.length <= MAX_EPISODES) return { ...ctx, episodes }
  const overflow = episodes.length - MAX_EPISODES
  const drop = new Set<number>()
  episodes.forEach((item, index) => {
    if (drop.size >= overflow) return
    if (!isDurableEpisode(item)) drop.add(index)
  })
  let kept = episodes.filter((_, index) => !drop.has(index))
  if (kept.length > MAX_EPISODES) kept = kept.slice(kept.length - MAX_EPISODES)
  return { ...ctx, episodes: kept }
}

export function summarizePlannerStep(input: {
  step: number
  action: string
  description: string
  command?: string | null
  now?: number
}): EpisodicSummary {
  const command = input.command?.trim() ? ` · cmd ${collapse(input.command, 80)}` : ''
  const text = `step ${input.step} ${input.action}: ${collapse(input.description, 160)}${command}`
  return createEpisode({
    text,
    tags: ['step', input.action, ...inferTags(input.description)],
    sourceChars: input.description.length,
    now: input.now
  })
}

function fingerprint(turn: TranscriptTurn): string {
  const source = `${turn.role}\n${turn.content}`
  let hash = 5381
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) + hash) ^ source.charCodeAt(i)
  return (hash >>> 0).toString(16)
}

function observationLineCap(role: TranscriptTurn['role']): number {
  return role === 'system' ? 100 : 140
}

/** Drop filler the cite window already rejected so a later fold cannot cite it again. */
function scrubCiteFillers(text: string, fillers: readonly string[]): string {
  let out = text
  for (const filler of fillers) {
    if (!filler || !out.includes(filler)) continue
    out = out.split(filler).join('')
  }
  return out
}

function lineHasBody(line: string): boolean {
  return line.replace(/^(?:user|assistant|system):\s*/, '').trim().length > 0
}

function formatTurnLine(turn: TranscriptTurn): { line: string; truncated: boolean } {
  const raw = redactSecrets(turn.content)
  const cited = citeObservationLine(raw, observationLineCap(turn.role))
  if (cited) {
    const prefix = turn.role === 'assistant' ? 'assistant: ' : turn.role === 'system' ? 'system: ' : 'user: '
    const line = `${prefix}${cited.text}`
    return {
      line: line.length > MAX_OBSERVATION_CHARS ? line.slice(0, MAX_OBSERVATION_CHARS) : line,
      truncated: true
    }
  }
  const content = raw.replace(/\s+/g, ' ').trim()
  if (!content) return { line: '', truncated: false }
  if (turn.role === 'assistant') {
    const extracted = extractAssistantLine(content)
    return { line: `assistant: ${extracted.slice(0, 140)}`, truncated: extracted.length > 140 }
  }
  if (turn.role === 'system') {
    return { line: `system: ${content.slice(0, 100)}`, truncated: content.length > 100 }
  }
  return { line: `user: ${content.slice(0, 140)}`, truncated: content.length > 140 }
}

function mergeCiteHold(prev: CiteWindow | undefined, fresh: TranscriptTurn[]): CiteWindow | undefined {
  const outside: string[] = [...(prev?.outsideHeadTail ?? [])]
  const dropped: string[] = [...(prev?.droppedFiller ?? [])]
  let head = prev?.head ?? 0
  let tail = prev?.tail ?? 0
  let saw = false
  for (const turn of fresh) {
    const cited = citeObservationLine(redactSecrets(turn.content), observationLineCap(turn.role))
    if (!cited) continue
    saw = true
    head = cited.cite.head
    tail = cited.cite.tail
    for (const marker of cited.cite.outsideHeadTail) {
      if (!outside.includes(marker)) outside.push(marker)
    }
    for (const filler of cited.cite.droppedFiller) {
      if (!dropped.includes(filler)) dropped.push(filler)
    }
  }
  if (!saw && !prev) return undefined
  return {
    head,
    tail,
    outsideHeadTail: outside.slice(0, 16),
    droppedFiller: dropped.slice(0, 8),
    stable: false
  }
}

function citeHoldStable(hold: CiteWindow, ctx: ThreadContext): boolean {
  const blob = `${ctx.observationalMemory.map((bullet) => bullet.text).join('\n')}\n${ctx.runningSummary}`
  return (
    hold.outsideHeadTail.every((marker) => ctx.observationalMemory.some((bullet) => bullet.text.includes(marker))) &&
    hold.droppedFiller.every((filler) => !blob.includes(filler))
  )
}

function extractAssistantLine(content: string): string {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(content.slice(start, end + 1)) as { description?: unknown; action?: unknown }
      if (obj && typeof obj.description === 'string' && obj.description.trim()) {
        const action = typeof obj.action === 'string' ? `${obj.action}: ` : ''
        return `${action}${obj.description.trim()}`
      }
    } catch {
      /* plain text */
    }
  }
  return content
}

function isConcreteObservation(text: string): boolean {
  return (
    /\/[\w./-]{2,}/.test(text) ||
    /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/.test(text) ||
    /\d+\s?%/.test(text) ||
    /\b[A-Z][A-Z0-9_]{4,}\b/.test(text) ||
    /\b(?:failed|denied|oom|error)\b/i.test(text)
  )
}

function draftObservation(turn: TranscriptTurn, now: number): { bullet: ObservationBullet; truncated: boolean } | null {
  const formatted = formatTurnLine(turn)
  if (!formatted.line) return null
  const cutToCap = formatted.line.length > MAX_OBSERVATION_CHARS
  return {
    bullet: {
      id: randomUUID(),
      text: cutToCap ? formatted.line.slice(0, MAX_OBSERVATION_CHARS) : formatted.line,
      createdAt: now
    },
    truncated: formatted.truncated || cutToCap
  }
}

/** One older turn → one redacted observational bullet. No model call. */
export function observationBulletFromTurn(turn: TranscriptTurn, now = Date.now()): ObservationBullet | null {
  return draftObservation(turn, now)?.bullet ?? null
}

function appendObservationBulletsCounted(
  existing: ObservationBullet[],
  fresh: Array<{ bullet: ObservationBullet; truncated: boolean }>,
  pinned: readonly string[] = []
): { bullets: ObservationBullet[]; dropped: number; truncated: number } {
  const next = [...existing]
  let truncated = 0
  for (const item of fresh) {
    const text = item.bullet.text.trim()
    if (!text || !lineHasBody(text)) continue
    if (next.some((row) => row.text === text)) continue
    next.push({ ...item.bullet, text })
    if (item.truncated) truncated += 1
  }
  const capped = capObservationBullets(next, pinned)
  return { bullets: capped.bullets, dropped: capped.dropped, truncated }
}

export function appendObservationBullets(existing: ObservationBullet[], fresh: ObservationBullet[]): ObservationBullet[] {
  return appendObservationBulletsCounted(
    existing,
    fresh.map((bullet) => ({ bullet, truncated: false }))
  ).bullets
}

/** Keep concrete facts when the bullet list overflows. Narrative fillers go first. */
function capObservationPool(bullets: ObservationBullet[], cap: number): { bullets: ObservationBullet[]; dropped: number } {
  if (cap <= 0) return { bullets: [], dropped: bullets.length }
  if (bullets.length <= cap) return { bullets, dropped: 0 }
  const concrete: ObservationBullet[] = []
  const rest: ObservationBullet[] = []
  for (const bullet of bullets) {
    if (isConcreteObservation(bullet.text)) concrete.push(bullet)
    else rest.push(bullet)
  }
  if (concrete.length > cap) {
    const head = Math.ceil(cap / 2)
    const tail = cap - head
    const kept = [...concrete.slice(0, head), ...concrete.slice(concrete.length - tail)]
    return { bullets: kept, dropped: bullets.length - kept.length }
  }
  const room = cap - concrete.length
  // `slice(-0)` is `slice(0)` and would keep every narrative line once concrete facts fill the cap.
  const narrative = room > 0 ? rest.slice(-room) : []
  const kept = [...concrete, ...narrative]
  kept.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return { bullets: kept, dropped: bullets.length - kept.length }
}

function pickPinnedBullets(rows: ObservationBullet[], markers: readonly string[], cap: number): ObservationBullet[] {
  const chosen: ObservationBullet[] = []
  const covered = new Set<string>()
  for (const marker of markers) {
    if (covered.has(marker) || chosen.length >= cap) continue
    const row = rows.find((bullet) => bullet.text.includes(marker) && !chosen.includes(bullet))
    if (!row) continue
    chosen.push(row)
    for (const item of markers) {
      if (row.text.includes(item)) covered.add(item)
    }
  }
  return chosen
}

/**
 * A later compression can re-cap the bullet list. Scarce markers already held
 * stay in some bullet even when they sit in the middle of the concrete list.
 */
function coverMissingMarkers(
  kept: ObservationBullet[],
  markers: readonly string[],
  cap: number
): { bullets: ObservationBullet[]; extraDropped: number } {
  let bullets = kept
  let extraDropped = 0
  for (const marker of markers) {
    if (!marker || bullets.some((bullet) => bullet.text.includes(marker))) continue
    const replacement: ObservationBullet = {
      id: randomUUID(),
      text: marker.slice(0, MAX_OBSERVATION_CHARS),
      createdAt: Date.now()
    }
    if (bullets.length < cap) {
      bullets = [...bullets, replacement]
      continue
    }
    const index = bullets.findIndex((bullet) => !markers.some((item) => item && bullet.text.includes(item)))
    if (index >= 0) {
      bullets = bullets.map((bullet, at) => (at === index ? replacement : bullet))
      extraDropped += 1
      continue
    }
    if (bullets.length === 0) {
      bullets = [replacement]
      continue
    }
    bullets = [...bullets.slice(0, -1), replacement]
    extraDropped += 1
  }
  return { bullets, extraDropped }
}

function capObservationBullets(
  bullets: ObservationBullet[],
  pinned: readonly string[] = []
): { bullets: ObservationBullet[]; dropped: number } {
  const cap = observationBulletCap()
  const markers = pinned.filter((marker) => marker.trim().length > 0)
  if (markers.length === 0) return capObservationPool(bullets, cap)
  const pinnedRows: ObservationBullet[] = []
  const pool: ObservationBullet[] = []
  for (const bullet of bullets) {
    if (markers.some((marker) => bullet.text.includes(marker))) pinnedRows.push(bullet)
    else pool.push(bullet)
  }
  const pinnedKept = pinnedRows.length > cap ? pickPinnedBullets(pinnedRows, markers, cap) : pinnedRows
  const rest = capObservationPool(pool, Math.max(0, cap - pinnedKept.length))
  let kept = [...pinnedKept, ...rest.bullets]
  let dropped = bullets.length - kept.length
  const covered = coverMissingMarkers(kept, markers, cap)
  kept = covered.bullets
  dropped += covered.extraDropped
  kept.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return { bullets: kept, dropped }
}

export function normalizeObservationBullets(value: unknown): ObservationBullet[] {
  if (!Array.isArray(value)) return []
  const parsed: ObservationBullet[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<ObservationBullet>
    if (typeof row.text !== 'string' || !row.text.trim()) continue
    parsed.push({
      id: typeof row.id === 'string' && row.id.trim() ? row.id : `om-${parsed.length}`,
      text: row.text.trim().slice(0, MAX_OBSERVATION_CHARS),
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0
    })
  }
  return appendObservationBullets([], parsed)
}

/** Keep the start of a folded transcript so the earliest facts are not the first thing dropped. */
function capRunningSummary(text: string, max: number): { text: string; truncated: boolean } {
  const trimmed = text.trim()
  if (trimmed.length <= max) return { text: trimmed, truncated: false }
  const headBudget = Math.min(400, Math.floor(max / 3))
  const tailBudget = max - headBudget - 1
  return {
    text: `${trimmed.slice(0, headBudget)}\n${trimmed.slice(trimmed.length - tailBudget)}`,
    truncated: true
  }
}

/**
 * Keep the last `maxTurns` exchanges. Older turns are folded into the running
 * summary and a durable episode. Already-folded prefixes are not summarized again.
 */
export function compactTranscript(
  turns: TranscriptTurn[],
  ctx: ThreadContext,
  maxTurns = DEFAULT_MAX_TURNS
): { recent: TranscriptTurn[]; ctx: ThreadContext; omBudget: OmBudgetSignal } {
  const finish = (recent: TranscriptTurn[], next: ThreadContext) => ({
    recent,
    ctx: next,
    omBudget: observeOmBudget(next)
  })
  const maxMessages = Math.max(2, maxTurns) * 2
  if (turns.length <= maxMessages) return finish(turns, ctx)
  const older = turns.slice(0, turns.length - maxMessages)
  const recent = turns.slice(turns.length - maxMessages)
  const last = older[older.length - 1]
  if (!last) return finish(recent, ctx)
  const cursor = fingerprint(last)
  if (ctx.compactedCursor === cursor && ctx.runningSummary) return finish(recent, ctx)

  let start = 0
  if (ctx.compactedCursor) {
    const found = older.findIndex((turn) => fingerprint(turn) === ctx.compactedCursor)
    if (found >= 0) start = found + 1
  }
  const fresh = older.slice(start)
  if (fresh.length === 0) {
    return finish(recent, { ...ctx, compactedCursor: cursor })
  }

  const citeHold = mergeCiteHold(ctx.citeHold, fresh)
  const fillers = citeHold?.droppedFiller ?? []
  const markers = citeHold?.outsideHeadTail ?? []
  const formatted = fresh.map((turn) => {
    const row = formatTurnLine(turn)
    const line = scrubCiteFillers(row.line, fillers)
    return { line, truncated: row.truncated || line !== row.line }
  })
  const piece = formatted
    .map((row) => row.line)
    .filter((line) => lineHasBody(line))
    .join('\n')
  if (!piece) return finish(recent, { ...ctx, compactedCursor: cursor })

  const cappedSummary = capRunningSummary(
    [scrubCiteFillers(ctx.runningSummary, fillers), piece].filter(Boolean).join('\n'),
    MAX_SUMMARY_CHARS
  )
  const drafts = fresh
    .map((turn, index) => draftObservation(turn, Date.now() + index))
    .filter((draft): draft is { bullet: ObservationBullet; truncated: boolean } => draft != null)
    .flatMap((draft) => {
      const text = scrubCiteFillers(draft.bullet.text, fillers).slice(0, MAX_OBSERVATION_CHARS)
      if (!lineHasBody(text)) return []
      return [
        {
          bullet: { ...draft.bullet, text },
          truncated: draft.truncated || text !== draft.bullet.text
        }
      ]
    })
  const existing = ctx.observationalMemory.flatMap((bullet) => {
    const text = scrubCiteFillers(bullet.text, fillers).slice(0, MAX_OBSERVATION_CHARS)
    if (!lineHasBody(text)) return []
    return [{ ...bullet, text }]
  })
  const appended = appendObservationBulletsCounted(existing, drafts, markers)
  const prev = ctx.omBudget ?? emptyOmBudget()
  let next: ThreadContext = {
    ...ctx,
    runningSummary: cappedSummary.text,
    compactedCursor: cursor,
    observationalMemory: appended.bullets,
    omBudget: {
      droppedBullets: prev.droppedBullets + appended.dropped,
      truncatedBullets: prev.truncatedBullets + appended.truncated,
      summaryTruncated: prev.summaryTruncated || cappedSummary.truncated
    },
    citeHold: citeHold ? { ...citeHold, stable: false } : undefined
  }
  if (next.citeHold) next = { ...next, citeHold: { ...next.citeHold, stable: citeHoldStable(next.citeHold, next) } }
  const chunks = chunkText(piece, MAX_EPISODE_CHARS)
  for (const chunk of chunks) {
    next = appendEpisode(
      next,
      createEpisode({
        text: chunk,
        tags: ['compaction', ...inferTags(chunk)],
        sourceChars: fresh.reduce((sum, turn) => sum + turn.content.length, 0)
      })
    )
  }
  return finish(recent, next)
}

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text]
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

type Ranked = { id: string; rank: number }

function rrf(lists: Array<{ signal: RecallSignal; ranks: Ranked[] }>, k = RRF_K): Map<string, { score: number; signals: RecallSignal[] }> {
  const fused = new Map<string, { score: number; signals: RecallSignal[] }>()
  for (const list of lists) {
    for (const row of list.ranks) {
      const prev = fused.get(row.id) ?? { score: 0, signals: [] }
      prev.score += 1 / (k + row.rank)
      if (!prev.signals.includes(list.signal)) prev.signals.push(list.signal)
      fused.set(row.id, prev)
    }
  }
  return fused
}

function rankByScore(ids: Array<{ id: string; score: number }>): Ranked[] {
  const ordered = [...ids].filter((row) => row.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return ordered.map((row, index) => ({ id: row.id, rank: index + 1 }))
}

/**
 * Hybrid recall. Keyword and token-overlap are always on. An optional embedding
 * rank list is fused with the same RRF the lexical lists use.
 */
export function recallEpisodes(
  query: string,
  episodes: EpisodicSummary[],
  opts?: { topK?: number; embedding?: { ranks: Ranked[] } }
): RecallHit[] {
  const topK = opts?.topK ?? DEFAULT_TOP_K
  if (topK <= 0 || episodes.length === 0) return []
  const queryTokens = contentTokens(query)
  const querySet = new Set(queryTokens)
  const keywordScores: Array<{ id: string; score: number }> = []
  const overlapScores: Array<{ id: string; score: number }> = []

  for (const episode of episodes) {
    const docTokens = contentTokens(`${episode.text} ${episode.tags.join(' ')}`)
    if (docTokens.length === 0 || queryTokens.length === 0) continue
    const docSet = new Set(docTokens)
    let keywordHits = 0
    for (const token of queryTokens) if (docSet.has(token)) keywordHits++
    const keyword = keywordHits / queryTokens.length
    if (keyword > 0) keywordScores.push({ id: episode.id, score: keyword })

    let intersection = 0
    for (const token of docSet) if (querySet.has(token)) intersection++
    const union = new Set([...querySet, ...docSet]).size
    const overlap = union === 0 ? 0 : intersection / union
    if (overlap > 0) overlapScores.push({ id: episode.id, score: overlap })
  }

  const lists: Array<{ signal: RecallSignal; ranks: Ranked[] }> = [
    { signal: 'keyword', ranks: rankByScore(keywordScores) },
    { signal: 'overlap', ranks: rankByScore(overlapScores) }
  ]
  const embeddingRanks = (opts?.embedding?.ranks ?? []).filter((row) => episodes.some((episode) => episode.id === row.id))
  if (embeddingRanks.length > 0) lists.push({ signal: 'embedding', ranks: embeddingRanks })

  const fused = rrf(lists)
  const byId = new Map(episodes.map((episode) => [episode.id, episode]))
  return [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, topK)
    .map(([id, row]) => {
      const episode = byId.get(id)!
      return {
        id,
        text: episode.text,
        score: row.score,
        signals: row.signals,
        tags: episode.tags,
        createdAt: episode.createdAt
      }
    })
}

export function buildMemoryPromptBlocks(input: {
  working: WorkingMemoryBlock | null
  observations: ObservationBullet[]
  runningSummary: string
  hits: RecallHit[]
  headings: { working: string; observations: string; summary: string; recall: string }
}): {
  text: string
  sections: { working: string; observations: string; runningSummary: string; recall: string }
} {
  const workingBody = renderWorking(input.working)
  const observationBody = input.observations.map((bullet) => `- ${bullet.text}`).join('\n')
  const summaryBody = input.runningSummary.trim()
  const recallBody = input.hits.map((hit) => `- ${hit.text}`).join('\n')
  const sections = {
    working: workingBody ? `${input.headings.working}\n${workingBody}` : '',
    observations: observationBody ? `${input.headings.observations}\n${observationBody}` : '',
    runningSummary: summaryBody ? `${input.headings.summary}\n${summaryBody}` : '',
    recall: recallBody ? `${input.headings.recall}\n${recallBody}` : ''
  }
  const text = [sections.working, sections.observations, sections.runningSummary, sections.recall].filter(Boolean).join('\n\n')
  return { text, sections }
}

function renderWorking(block: WorkingMemoryBlock | null): string {
  if (!block) return ''
  const lines = [`goal: ${block.goal}`]
  if (block.constraints.length > 0) lines.push(`constraints: ${block.constraints.join('; ')}`)
  if (block.hostFacts.length > 0) lines.push(`hostFacts: ${block.hostFacts.join('; ')}`)
  if (block.successCriteria) lines.push(`success: ${block.successCriteria}`)
  lines.push(`status: ${block.status}`)
  return lines.join('\n')
}

export function contextBudget(input: {
  workingChars: number
  workingItems?: number
  observationChars: number
  observationItems?: number
  summaryChars: number
  recallChars: number
  recallItems?: number
  recentChars: number
  recentItems?: number
  systemChars: number
}): { slices: ContextSlice[]; totalChars: number } {
  const slices: ContextSlice[] = [
    { name: 'working', chars: input.workingChars, items: input.workingItems ?? 0 },
    { name: 'observations', chars: input.observationChars, items: input.observationItems ?? 0 },
    { name: 'runningSummary', chars: input.summaryChars },
    { name: 'recall', chars: input.recallChars, items: input.recallItems ?? 0 },
    { name: 'recentWindow', chars: input.recentChars, items: input.recentItems ?? 0 },
    { name: 'system', chars: input.systemChars }
  ]
  return { slices, totalChars: input.systemChars + input.recentChars }
}

export type DurableThreadFields = {
  notes: string[]
  recentCommands: string[]
  observations: string[]
  taskSummaries: string[]
  updatedAt: number
  workingMemory: WorkingMemoryBlock | null
  episodes: EpisodicSummary[]
  runningSummary: string
  observationalMemory: ObservationBullet[]
  compactedCursor: string | null
  omBudget?: OmBudgetMark
  citeHold?: CiteWindow
}

/**
 * Chat clear: archive the current goal into notes/task summaries, then drop
 * working memory, episodes, and the running summary. Commands and observations
 * stay. This does not know about host inventory.
 */
export function archiveAndClearRecord<T extends DurableThreadFields>(record: T): T {
  const notes = [...record.notes]
  const taskSummaries = [...record.taskSummaries]
  if (record.workingMemory?.goal.trim()) {
    const archived = formatArchivedGoal(record.workingMemory.goal)
    notes.push(archived.note)
    taskSummaries.push(archived.taskSummary)
  }
  return {
    ...record,
    notes: notes.slice(-8),
    taskSummaries: taskSummaries.slice(-6),
    workingMemory: null,
    episodes: [],
    runningSummary: '',
    observationalMemory: [],
    compactedCursor: null,
    omBudget: emptyOmBudget(),
    citeHold: undefined,
    updatedAt: Date.now()
  }
}
