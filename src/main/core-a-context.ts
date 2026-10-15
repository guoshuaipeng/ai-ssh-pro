/**
 * Core-A context assembly, adapted into the existing planner loop:
 * - Mastra Memory: working memory every turn, a last-N transcript window, and recall
 *   (keyword + overlap stand in for semantic recall until an embedder exists).
 * - LangGraph: fold older turns into a running summary instead of only trimming them;
 *   side-effecting tools pause for a human (interrupt).
 * - Graphorin: working tier (current task) vs session transcript vs episodic recall,
 *   fused with Reciprocal Rank Fusion (k=60).
 * - Vercel AI SDK ToolLoopAgent: needsApproval for side-effecting tools.
 *
 * Compaction is extractive and local: no extra model call and no network.
 * `recallEpisodes(..., { embedding })` accepts a third rank list so a vector
 * retriever can be fused later without changing the prompt shape.
 */

import { randomUUID } from 'node:crypto'

export type WorkingStatus = 'active' | 'blocked' | 'done'

/** Graphorin working-tier block. v1 keeps a single current-task block. */
export type WorkingMemoryBlock = {
  id: 'current_task'
  goal: string
  constraints: string[]
  successCriteria?: string
  status: WorkingStatus
  updatedAt: number
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
  /** Fingerprint of the last message folded into `runningSummary`. */
  compactedCursor: string | null
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

export type ContextSliceName = 'working' | 'runningSummary' | 'recall' | 'recentWindow' | 'system'

export type ContextSlice = {
  name: ContextSliceName
  chars: number
  items?: number
}

export const EMPTY_THREAD: ThreadContext = {
  workingMemory: null,
  episodes: [],
  runningSummary: '',
  compactedCursor: null
}

const MAX_EPISODES = 40
const MAX_SUMMARY_CHARS = 1500
const MAX_EPISODE_CHARS = 500
const RRF_K = 60
const DEFAULT_TOP_K = 5
const DEFAULT_MAX_TURNS = 8

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
 * SSH `command` writes are side effects and must pause for confirmation.
 * Read-only tool calls (terminal snapshot, inventory reads/writes to the local
 * knowledge base) do not. Risk level never bypasses this.
 */
export function actionNeedsHumanInterrupt(action: string): boolean {
  return action === 'command'
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

function seedBlock(text: string, now: number): WorkingMemoryBlock {
  const goal = collapse(text, 200)
  const success = extractSuccess(text)
  return {
    id: 'current_task',
    goal: goal || text.trim().slice(0, 200),
    constraints: extractConstraints(text),
    ...(success ? { successCriteria: success } : {}),
    status: 'active',
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
    const seeded = seedBlock(seedFrom, now)
    next = { ...next, workingMemory: seeded }
    if (latest && latest !== seedFrom && shouldReplaceGoal(seeded.goal, latest)) {
      switchedFrom = seeded
      next = replaceGoal(next, latest, now)
    }
    return { ctx: next, switchedFrom }
  }

  if (!latest) return { ctx: next, switchedFrom: null }

  if (shouldReplaceGoal(next.workingMemory.goal, latest)) {
    switchedFrom = next.workingMemory
    next = replaceGoal(next, latest, now)
    return { ctx: next, switchedFrom }
  }

  const constraints = mergeConstraints(next.workingMemory.constraints, latest)
  const success = next.workingMemory.successCriteria ?? extractSuccess(latest)
  const status: WorkingStatus = next.workingMemory.status === 'done' ? 'active' : next.workingMemory.status
  const changed =
    status !== next.workingMemory.status ||
    constraints.length !== next.workingMemory.constraints.length ||
    success !== next.workingMemory.successCriteria
  if (!changed) return { ctx: next, switchedFrom: null }
  next = {
    ...next,
    workingMemory: {
      ...next.workingMemory,
      constraints,
      ...(success ? { successCriteria: success } : {}),
      status,
      updatedAt: now
    }
  }
  return { ctx: next, switchedFrom: null }
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
  return {
    ...ctx,
    episodes,
    workingMemory: seedBlock(utterance, now)
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

function formatTurnLine(turn: TranscriptTurn): string {
  const content = redactSecrets(turn.content).replace(/\s+/g, ' ').trim()
  if (!content) return ''
  if (turn.role === 'assistant') return `assistant: ${extractAssistantLine(content).slice(0, 140)}`
  if (turn.role === 'system') return `system: ${content.slice(0, 100)}`
  return `user: ${content.slice(0, 140)}`
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

function capTail(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(trimmed.length - max)
}

/**
 * Keep the last `maxTurns` exchanges. Older turns are folded into the running
 * summary and a durable episode. Already-folded prefixes are not summarized again.
 */
export function compactTranscript(
  turns: TranscriptTurn[],
  ctx: ThreadContext,
  maxTurns = DEFAULT_MAX_TURNS
): { recent: TranscriptTurn[]; ctx: ThreadContext } {
  const maxMessages = Math.max(2, maxTurns) * 2
  if (turns.length <= maxMessages) return { recent: turns, ctx }
  const older = turns.slice(0, turns.length - maxMessages)
  const recent = turns.slice(turns.length - maxMessages)
  const last = older[older.length - 1]
  if (!last) return { recent, ctx }
  const cursor = fingerprint(last)
  if (ctx.compactedCursor === cursor && ctx.runningSummary) return { recent, ctx }

  let start = 0
  if (ctx.compactedCursor) {
    const found = older.findIndex((turn) => fingerprint(turn) === ctx.compactedCursor)
    if (found >= 0) start = found + 1
  }
  const fresh = older.slice(start)
  if (fresh.length === 0) {
    return { recent, ctx: { ...ctx, compactedCursor: cursor } }
  }

  const piece = fresh.map(formatTurnLine).filter(Boolean).join('\n')
  if (!piece) return { recent, ctx: { ...ctx, compactedCursor: cursor } }

  const runningSummary = capTail([ctx.runningSummary, piece].filter(Boolean).join('\n'), MAX_SUMMARY_CHARS)
  let next: ThreadContext = { ...ctx, runningSummary, compactedCursor: cursor }
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
  return { recent, ctx: next }
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
  runningSummary: string
  hits: RecallHit[]
  headings: { working: string; summary: string; recall: string }
}): {
  text: string
  sections: { working: string; runningSummary: string; recall: string }
} {
  const workingBody = renderWorking(input.working)
  const summaryBody = input.runningSummary.trim()
  const recallBody = input.hits.map((hit) => `- ${hit.text}`).join('\n')
  const sections = {
    working: workingBody ? `${input.headings.working}\n${workingBody}` : '',
    runningSummary: summaryBody ? `${input.headings.summary}\n${summaryBody}` : '',
    recall: recallBody ? `${input.headings.recall}\n${recallBody}` : ''
  }
  const text = [sections.working, sections.runningSummary, sections.recall].filter(Boolean).join('\n\n')
  return { text, sections }
}

function renderWorking(block: WorkingMemoryBlock | null): string {
  if (!block) return ''
  const lines = [`goal: ${block.goal}`]
  if (block.constraints.length > 0) lines.push(`constraints: ${block.constraints.join('; ')}`)
  if (block.successCriteria) lines.push(`success: ${block.successCriteria}`)
  lines.push(`status: ${block.status}`)
  return lines.join('\n')
}

export function contextBudget(input: {
  workingChars: number
  workingItems?: number
  summaryChars: number
  recallChars: number
  recallItems?: number
  recentChars: number
  recentItems?: number
  systemChars: number
}): { slices: ContextSlice[]; totalChars: number } {
  const slices: ContextSlice[] = [
    { name: 'working', chars: input.workingChars, items: input.workingItems ?? 0 },
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
  compactedCursor: string | null
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
    compactedCursor: null,
    updatedAt: Date.now()
  }
}
