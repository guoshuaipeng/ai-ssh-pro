import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Store from 'electron-store'
import {
  archiveAndClearRecord,
  normalizeObservationBullets,
  type DurableThreadFields,
  type EpisodicSummary,
  type OmBudgetMark,
  type ThreadContext,
  type WorkingMemoryBlock
} from './core-a-context'
import type { CiteWindow } from './core-a-output-truncate'
import { visibleWorkingGoal } from '../shared/working-memory-view'

/** 可持久化的会话记忆（OpenClaw 会话存储的轻量对标）+ 线程工作记忆 */
export type PersistedCoreSession = DurableThreadFields

type CoreMemorySchema = {
  sessions: Record<string, PersistedCoreSession>
}

function memoryStoreOptions(): ConstructorParameters<typeof Store<CoreMemorySchema>>[0] {
  const options = {
    name: 'core-a-sessions',
    defaults: { sessions: {} as Record<string, PersistedCoreSession> }
  }
  if (process.versions.electron) return options
  // Node tests have no Electron userData path. Production Electron keeps the default location.
  const cwd = process.env.AISS_CORE_MEMORY_CWD?.trim() || join(tmpdir(), 'ai-ssh-pro-core-memory')
  mkdirSync(cwd, { recursive: true })
  return { ...options, projectName: 'ai-ssh-pro', cwd } as ConstructorParameters<typeof Store<CoreMemorySchema>>[0]
}

const memoryStore = new Store<CoreMemorySchema>(memoryStoreOptions())

const MAX_SESSIONS = 80

const threadEpoch = new Map<string, number>()
const clearListeners = new Set<(sessionKey: string) => void>()

function normalizeKey(sessionKey: string): string {
  return sessionKey.trim() || 'global'
}

export function onThreadContextCleared(fn: (sessionKey: string) => void): void {
  clearListeners.add(fn)
}

export function currentThreadEpoch(sessionKey: string): number {
  return threadEpoch.get(normalizeKey(sessionKey)) ?? 0
}

export function threadWriteAllowed(sessionKey: string, epochAtLoad: number): boolean {
  return currentThreadEpoch(sessionKey) <= epochAtLoad
}

function asStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').slice(-limit)
}

/** Keep the earliest scratchpad facts. A tail slice would drop the rare fact first. */
function asStringHead(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const text = item.trim()
    if (!text || out.includes(text)) continue
    out.push(text.slice(0, 80))
    if (out.length >= limit) break
  }
  return out
}

function coerceWorking(value: unknown): WorkingMemoryBlock | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<WorkingMemoryBlock>
  if (typeof row.goal !== 'string' || !row.goal.trim()) return null
  const status = row.status === 'blocked' || row.status === 'done' || row.status === 'active' ? row.status : 'active'
  return {
    id: 'current_task',
    goal: row.goal.trim().slice(0, 200),
    constraints: asStringList(row.constraints, 6),
    hostFacts: asStringHead(row.hostFacts, 8),
    ...(typeof row.successCriteria === 'string' && row.successCriteria.trim()
      ? { successCriteria: row.successCriteria.trim().slice(0, 80) }
      : {}),
    status,
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0
  }
}

function coerceEpisodes(value: unknown): EpisodicSummary[] {
  if (!Array.isArray(value)) return []
  const out: EpisodicSummary[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<EpisodicSummary>
    if (typeof row.text !== 'string' || !row.text.trim()) continue
    out.push({
      id: typeof row.id === 'string' && row.id.trim() ? row.id : `ep-${out.length}`,
      text: row.text.trim().slice(0, 500),
      tags: asStringList(row.tags, 8),
      sourceChars: typeof row.sourceChars === 'number' ? row.sourceChars : row.text.length,
      createdAt: typeof row.createdAt === 'number' ? row.createdAt : 0
    })
  }
  return out.slice(-40)
}

function coerceCiteHold(value: unknown): CiteWindow | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Partial<CiteWindow>
  const outside = Array.isArray(row.outsideHeadTail)
    ? row.outsideHeadTail.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 16)
    : []
  const dropped = Array.isArray(row.droppedFiller)
    ? row.droppedFiller.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
    : []
  if (outside.length === 0 && dropped.length === 0) return undefined
  return {
    head: typeof row.head === 'number' && Number.isFinite(row.head) ? Math.floor(row.head) : 0,
    tail: typeof row.tail === 'number' && Number.isFinite(row.tail) ? Math.floor(row.tail) : 0,
    outsideHeadTail: outside,
    droppedFiller: dropped,
    stable: row.stable === true
  }
}

function coerceOmBudget(value: unknown): OmBudgetMark | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Partial<OmBudgetMark>
  const droppedBullets =
    typeof row.droppedBullets === 'number' && Number.isFinite(row.droppedBullets) && row.droppedBullets > 0
      ? Math.floor(row.droppedBullets)
      : 0
  const truncatedBullets =
    typeof row.truncatedBullets === 'number' && Number.isFinite(row.truncatedBullets) && row.truncatedBullets > 0
      ? Math.floor(row.truncatedBullets)
      : 0
  const summaryTruncated = row.summaryTruncated === true
  if (droppedBullets === 0 && truncatedBullets === 0 && !summaryTruncated) return undefined
  return { droppedBullets, truncatedBullets, summaryTruncated }
}

function coerceRecord(value: unknown): PersistedCoreSession {
  const row = value && typeof value === 'object' ? (value as Partial<PersistedCoreSession>) : {}
  return {
    notes: asStringList(row.notes, 8),
    recentCommands: asStringList(row.recentCommands, 6),
    observations: asStringList(row.observations, 10),
    taskSummaries: asStringList(row.taskSummaries, 6),
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
    workingMemory: coerceWorking(row.workingMemory),
    episodes: coerceEpisodes(row.episodes),
    runningSummary: typeof row.runningSummary === 'string' ? row.runningSummary.slice(-1500) : '',
    observationalMemory: normalizeObservationBullets(row.observationalMemory),
    compactedCursor: typeof row.compactedCursor === 'string' ? row.compactedCursor : null,
    omBudget: coerceOmBudget(row.omBudget),
    citeHold: coerceCiteHold(row.citeHold)
  }
}

function readAll(): Record<string, PersistedCoreSession> {
  const raw = memoryStore.get('sessions')
  if (!raw || typeof raw !== 'object') return {}
  return { ...raw }
}

function writeAll(sessions: Record<string, PersistedCoreSession>): void {
  const keys = Object.keys(sessions)
  if (keys.length > MAX_SESSIONS) {
    const sorted = keys.sort((a, b) => (sessions[a]?.updatedAt ?? 0) - (sessions[b]?.updatedAt ?? 0))
    for (const key of sorted.slice(0, keys.length - MAX_SESSIONS)) delete sessions[key]
  }
  memoryStore.set('sessions', sessions)
}

function mutate(sessionKey: string, fn: (row: PersistedCoreSession) => PersistedCoreSession): void {
  const key = normalizeKey(sessionKey)
  const sessions = readAll()
  sessions[key] = fn(coerceRecord(sessions[key]))
  writeAll(sessions)
}

export function loadPersistedCoreSession(sessionKey: string): PersistedCoreSession | null {
  const key = normalizeKey(sessionKey)
  const row = readAll()[key]
  if (!row || typeof row !== 'object') return null
  return coerceRecord(row)
}

export function savePersistedCoreSession(
  sessionKey: string,
  data: {
    notes: string[]
    recentCommands: string[]
    observations: string[]
    taskGraph: Array<{ title: string; status: string }>
  },
  epochAtLoad?: number
): void {
  const key = normalizeKey(sessionKey)
  if (epochAtLoad !== undefined && !threadWriteAllowed(key, epochAtLoad)) return
  mutate(key, (row) => ({
    ...row,
    notes: data.notes.slice(-8),
    recentCommands: data.recentCommands.slice(-6),
    observations: data.observations.slice(-10),
    taskSummaries: data.taskGraph.slice(-6).map((task) => `[${task.status}] ${task.title}`),
    updatedAt: Date.now()
  }))
}

/** Current working-memory goal for the chat thread. Blank keys and empty goals return null. */
export function getWorkingMemoryGoal(sessionKey: string): string | null {
  const key = sessionKey.trim()
  if (!key) return null
  const row = readAll()[key]
  if (!row || typeof row !== 'object') return null
  return visibleWorkingGoal(coerceRecord(row).workingMemory?.goal)
}

export function loadThreadContext(sessionKey: string): { ctx: ThreadContext; epoch: number } {
  const key = normalizeKey(sessionKey)
  const row = coerceRecord(readAll()[key])
  return {
    ctx: {
      workingMemory: row.workingMemory,
      episodes: row.episodes,
      runningSummary: row.runningSummary,
      observationalMemory: row.observationalMemory,
      compactedCursor: row.compactedCursor,
      omBudget: row.omBudget,
      citeHold: row.citeHold
    },
    epoch: currentThreadEpoch(key)
  }
}

export function saveThreadContext(sessionKey: string, ctx: ThreadContext, epochAtLoad: number): void {
  const key = normalizeKey(sessionKey)
  if (!threadWriteAllowed(key, epochAtLoad)) return
  mutate(key, (row) => ({
    ...row,
    workingMemory: ctx.workingMemory,
    episodes: ctx.episodes.slice(-40),
    runningSummary: ctx.runningSummary.slice(-1500),
    observationalMemory: normalizeObservationBullets(ctx.observationalMemory),
    compactedCursor: ctx.compactedCursor,
    omBudget: coerceOmBudget(ctx.omBudget),
    citeHold: coerceCiteHold(ctx.citeHold),
    updatedAt: Date.now()
  }))
}

export function appendStoredArchive(
  sessionKey: string,
  note: string,
  taskSummary: string,
  epochAtLoad: number
): void {
  const key = normalizeKey(sessionKey)
  if (!threadWriteAllowed(key, epochAtLoad)) return
  const line = note.trim()
  const task = taskSummary.trim()
  if (!line && !task) return
  mutate(key, (row) => ({
    ...row,
    notes: line ? [...row.notes, line].slice(-8) : row.notes,
    taskSummaries: task ? [...row.taskSummaries, task].slice(-6) : row.taskSummaries,
    updatedAt: Date.now()
  }))
}

/** Archive the current goal, then drop working memory and episodic summaries for this thread. */
export function archiveAndClearThreadContext(sessionKey: string): void {
  const key = normalizeKey(sessionKey)
  threadEpoch.set(key, Date.now())
  const sessions = readAll()
  if (sessions[key]) {
    sessions[key] = archiveAndClearRecord(coerceRecord(sessions[key]))
    writeAll(sessions)
  }
  for (const listener of clearListeners) listener(key)
}
