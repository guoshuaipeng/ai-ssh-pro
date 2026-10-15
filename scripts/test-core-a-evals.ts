/**
 * Core-A multi-turn evals. Every `*.json` file in tests/fixtures/core-a/ is a
 * scenario (S1–S21 and any later drop-in, including S20-N). The real planner
 * runs against the fixture's scripted model and a fake terminal.
 * S20: after contradictory filler, observational memory still has the original
 * rare-fact tokens, and the end must not adopt the filler's path, Use%, or host state.
 * S21: denying one HITL step mid-chain does not write that step or a later
 * file/host update, and does not treat the deny as success. The same chain
 * with every step approved still completes.
 *
 * Run: npx tsx --test scripts/test-core-a-evals.ts
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { HostServiceKind } from '../src/shared/inventory.ts'
import type { AiChatMessage, AiSettings, AiStreamEvent } from '../src/shared/ipc.ts'
import {
  annotateUnappliedFailure,
  applyPatchDraft,
  createMockTree,
  decidePatch,
  patchDraftConfirmCard,
  reviewNpmTestFailure
} from '../src/main/core-a-tfl.ts'
import { patchWritePermitted, sideEffectExecutionPermitted } from '../src/main/core-a-context.ts'
import { loadPersistedCoreSession } from '../src/main/core-a-memory.ts'

const memDir = mkdtempSync(join(tmpdir(), 'core-a-eval-mem-'))
const invDir = mkdtempSync(join(tmpdir(), 'core-a-eval-inv-'))
process.env.AISS_CORE_MEMORY_CWD = memDir
process.env.AISS_INVENTORY_ROOT = invDir
process.env.AISS_POLL_WAIT_MS = '0'
process.env.AISS_COMMAND_SETTLE_MS = '200'

type AgentModule = typeof import('../src/main/ai-interactive-agent.ts')
type InventoryModule = typeof import('../src/main/inventory-store.ts')
let agent: AgentModule
let inventory: InventoryModule

type Reply = {
  description: string
  action: 'tool_call' | 'command' | 'end'
  toolName?: string
  toolInput?: Record<string, unknown>
  command?: string
  riskLevel?: string
  completed?: boolean
  notes?: string
}

type PlannerStep = {
  response: Reply
  expectToolResultContains?: string[]
}

type Expectation = {
  minPlannerSteps?: number
  maxPlannerSteps?: number
  actionSequenceContains?: string[]
  firstEvidenceAction?: string
  finalAction?: string
  completed?: boolean
  descriptionMustContain?: string[]
  /** End text must not adopt these literals (S17 invented disk; S20 contradictory filler). */
  descriptionMustNotContain?: string[]
  descriptionMustMatchAny?: string[]
  commandsRequiringConfirm?: string[]
  forbiddenCommands?: string[]
  mustNotEmitCommands?: string[]
  maxConsecutiveGetTerminalSnapshot?: number
  maxGetTerminalSnapshot?: number
  maxGetTerminalSnapshotExecuted?: number
  memoryMustRetain?: string[]
  memoryMustStillRetainFromT1?: string[]
  mustTerminate?: boolean
  workingMemoryAfter?: { goalMentions?: string[] }
  sessionIntent?: { goalContainsAnyOf?: string[] }
  intentSwitch?: { newGoalMentions?: string[]; archiveOldWorkingMemory?: boolean }
  activeGoalMustNotBe?: string[]
  confirmGate?: { required?: boolean; riskLevel?: string; settingsAutoApproveLowRisk?: boolean }
  ipc?: string[]
  /** These event types must not appear (S21 all-approve must not look cancelled). */
  ipcMustNotInclude?: string[]
  sshWriteCount?: number
  noFurtherPlannerStepsAfterDeny?: boolean
  riskLevel?: string
  /** Host inventory after the turn (S21 deny stays at the seed; all-approve records the chain). */
  hostState?: {
    serviceNames?: string[]
    notesEqual?: string[]
    notesMustContain?: string[]
    notesMustNotContain?: string[]
  }
  /**
   * S21: one HITL deny in the middle of a chain. The denied command is not a
   * write, not a prefix of a write, and not a recorded success. Later scripted
   * steps must not leave file or host leftovers. Stopping with cancelled, or
   * ending without those leftovers (证据不足 is enough), both pass.
   */
  midChainDeny?: {
    deniedCommand: string
    keptCommands?: string[]
    laterCommands?: string[]
    leftoverMarkers: string[]
  }
  /** Observational-memory section must still contain these tokens (S13 / S16 / S20). */
  observationalMemoryMustContain?: string[]
  recentWindowMustNotContain?: string[]
  /** System prompt must not carry another host's facts (S18). */
  plannerPromptMustNotContain?: string[]
  hitl?: {
    minInterrupts?: number
    resume?: 'approve' | 'deny'
    /** Resume decisions in confirm order. Deny ≠ an approve of that step. */
    decisions?: Array<'approve' | 'deny'>
    interruptRisks?: string[]
  }
}

type Turn = {
  turnId: string
  userMessage: string
  mockTerminal?: { initialRing?: string; afterWrite?: Record<string, string> }
  userConfirm?: {
    policy?: string
    /** Per confirm, in order. `per-step` fails closed once this list runs out. */
    decisions?: Array<'approve' | 'deny'>
    assert?: { stepHasRequestId?: boolean; autoApproved?: boolean; sshWriteBeforeApprove?: boolean; riskLevelMustBe?: string }
  }
  mockedPlannerSteps?: PlannerStep[]
  expected?: Expectation
}

type TflSpec = {
  npmOutput: string
  mockTree: Record<string, string>
  explanationMustContain: string[]
  explanationMustNotContain?: string[]
  agreeMustContain?: string[]
}

type Fixture = {
  id: string
  title: string
  hostProfile?: { hostId?: string; label?: string; hostname?: string }
  session: { targetSessionId: string; historyKey: string }
  settings?: { autoApproveLowRisk?: boolean; useOpenClaw?: boolean }
  env?: Record<string, string>
  /** A-TFL: a failing gate, explained locally, applied only in the harness mock. */
  tfl?: TflSpec
  seedInventory?: {
    hostId: string
    services?: Array<{ name: string; kind?: string; ports?: number[]; notes?: string; unit?: string }>
    notes?: string[]
  }
  turns?: Turn[]
  negativeCase?: Turn
  /**
   * S21: the same planner chain with every confirm approved, on its own host
   * and history key so the deny case cannot leave state behind for it.
   */
  regressionCase?: Turn & {
    session?: Fixture['session']
    hostProfile?: Fixture['hostProfile']
    seedInventory?: Fixture['seedInventory']
  }
  /**
   * S18: seed a fact on another historyKey / hostInventoryId before the main turns.
   * Main-turn prompts must not contain that host's rare service or port.
   */
  isolationPrelude?: {
    hostProfile?: { hostId?: string; label?: string; hostname?: string }
    session: { targetSessionId: string; historyKey: string }
    seedInventory?: Fixture['seedInventory']
    turns: Turn[]
  }
}

const KINDS = new Set<HostServiceKind>(['systemd', 'docker', 'k8s', 'binary', 'unknown'])

function loadFixtures(): Fixture[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/core-a')
  const names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
  assert.ok(names.length > 0, `no fixtures in ${dir}`)
  const fixtures = names.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')) as Fixture)
  const ids = fixtures.map((fixture) => fixture.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate fixture id: ${ids.join(', ')}`)
  return fixtures.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

function presentRing(raw: string | undefined): string {
  const text = raw ?? ''
  if (!text.trim()) return ''
  const lines = text.split(/\n/)
  const endsWithPrompt = /[$#>]\s*$/.test(text.trimEnd())
  if (lines.length >= 5 && endsWithPrompt) return text.endsWith('\n') ? text : `${text}\n`
  return `${text.replace(/\s*$/, '')}\nuser@web:~$\n# ring\n# kept\n# pad\nuser@web:~$\n`
}

function goalLine(prompt: string): string {
  return prompt.split('\n').find((line) => line.startsWith('goal:')) ?? ''
}

function blockAfter(prompt: string, heading: string): string {
  const at = prompt.indexOf(heading)
  if (at < 0) return ''
  const rest = prompt.slice(at + heading.length).replace(/^\n/, '')
  const end = rest.search(/\n\n/)
  return (end < 0 ? rest : rest.slice(0, end)).trim()
}

function observationalSection(prompt: string): string {
  return blockAfter(prompt, '观测记忆（较早对话压缩）：') || blockAfter(prompt, 'Observational memory (compressed older turns):')
}

function hitlLines(events: AiStreamEvent[]): string[] {
  const lines: string[] = []
  for (const event of events) {
    if (event.type !== 'debug' || event.payload.entry.kind !== 'execution') continue
    if (!event.payload.entry.label.startsWith('HITL')) continue
    lines.push(`${event.payload.entry.label}\n${event.payload.entry.detail ?? ''}`)
  }
  return lines
}

function systemText(messages: Array<{ role: string; content: string }>): string {
  return messages
    .filter((message) => message.role === 'system' && message.content !== 'json')
    .map((message) => message.content)
    .join('\n')
}

function subsequence(actions: string[], need: string[]): boolean {
  let index = 0
  for (const action of actions) {
    if (action === need[index]) index += 1
    if (index === need.length) return true
  }
  return need.length === 0
}

/** A forbidden phrase inside “未…reboot” / “勿 chmod” is a refusal, not a suggestion. */
function violates(text: string, pattern: string): boolean {
  const hay = text.toLowerCase()
  const needle = pattern.toLowerCase()
  let from = 0
  while (from <= hay.length) {
    const index = hay.indexOf(needle, from)
    if (index < 0) return false
    const prefix = text.slice(Math.max(0, index - 16), index)
    if (!/未|不|没有|勿|别|禁止|not\s|never|without/i.test(prefix)) return true
    from = index + Math.max(needle.length, 1)
  }
  return false
}

function seedInventory(fixture: Fixture): void {
  const seed = fixture.seedInventory
  if (!seed) return
  inventory.getInventoryStore().upsert({
    id: seed.hostId,
    title: fixture.hostProfile?.label || seed.hostId,
    host: fixture.hostProfile?.hostname,
    services: (seed.services ?? []).map((service) => ({
      name: service.name,
      kind: KINDS.has(service.kind as HostServiceKind) ? (service.kind as HostServiceKind) : 'unknown',
      ports: service.ports,
      unit: service.unit,
      notes: [service.notes, service.kind && !KINDS.has(service.kind as HostServiceKind) ? `kind=${service.kind}` : '']
        .filter(Boolean)
        .join(' ')
    })),
    notesMarkdown: (seed.notes ?? []).join('\n')
  })
}

type DriveResult = {
  events: AiStreamEvent[]
  prompts: string[]
  requests: Array<Array<{ role: string; content: string }>>
  writes: string[]
  served: string[]
}

async function drive(input: {
  fixture: Fixture
  turn: Turn
  sessionId: string
  history: AiChatMessage[]
  approve: boolean
}): Promise<DriveResult> {
  const events: AiStreamEvent[] = []
  const prompts: string[] = []
  const requests: Array<Array<{ role: string; content: string }>> = []
  const writes: string[] = []
  const served: string[] = []
  const replies = (input.turn.mockedPlannerSteps ?? []).map((step) => JSON.stringify(step.response))
  const afterWrite = input.turn.mockTerminal?.afterWrite ?? {}
  let lastCommand = ''
  let confirmError: Error | null = null
  const policy = input.turn.userConfirm?.policy ?? 'approve-all-commands'
  const decisions = [...(input.turn.userConfirm?.decisions ?? [])]
  const takeDecision = (): boolean => {
    if (decisions.length > 0) return decisions.shift() === 'approve'
    if (policy === 'per-step') return false
    return input.approve
  }
  const confirmAssert = input.turn.userConfirm?.assert
  const settings = {
    providers: [
      {
        id: 'eval',
        name: 'eval',
        baseURL: 'http://127.0.0.1:9/v1',
        apiKey: 'eval-key',
        modelList: ['eval-model']
      }
    ],
    activeProviderId: 'eval',
    model: 'eval-model',
    temperature: 0,
    sshParseInstructions: '',
    useOpenClaw: input.fixture.settings?.useOpenClaw !== false,
    autoApproveLowRisk: input.fixture.settings?.autoApproveLowRisk === true
  } as AiSettings
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : '{}'
    const parsed = JSON.parse(raw) as { messages?: Array<{ role: string; content: string }> }
    const messages = parsed.messages ?? []
    requests.push(messages)
    prompts.push(systemText(messages))
    const next = replies.shift()
    if (!next) throw new Error(`${input.turn.turnId}: scripted model ran out of replies`)
    return new Response(JSON.stringify({ choices: [{ message: { content: next } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  const ssh = {
    getRingSnapshot: () => {
      const raw = lastCommand && afterWrite[lastCommand] != null ? afterWrite[lastCommand] : input.turn.mockTerminal?.initialRing
      const text = presentRing(raw)
      served.push(text)
      return text
    },
    write: (_sessionId: string, data: string) => {
      writes.push(data)
      lastCommand = data.replace(/\s+$/, '')
      return true
    }
  }
  const wc = {
    isDestroyed: () => false,
    send: (_channel: string, ev: AiStreamEvent) => {
      events.push(ev)
      if (ev.type === 'step' && ev.requestId) {
        const before = writes.length
        const requestId = ev.requestId
        if (policy === 'none') {
          confirmError = new Error(`${input.turn.turnId}: command was issued under confirm policy none`)
          agent.resolveAiConfirmStep(requestId, false)
          return
        }
        queueMicrotask(() => {
          try {
            if (confirmAssert?.sshWriteBeforeApprove !== false) {
              assert.equal(writes.length, before, `${input.turn.turnId}: command written before confirm`)
            }
            if (confirmAssert?.stepHasRequestId) assert.ok(requestId)
            if (confirmAssert?.autoApproved === false) assert.notEqual(ev.autoApproved, true)
            if (confirmAssert?.riskLevelMustBe) assert.equal(ev.structured.riskLevel, confirmAssert.riskLevelMustBe)
            assert.notEqual(ev.autoApproved, true)
            agent.resolveAiConfirmStep(requestId, takeDecision())
          } catch (error) {
            confirmError = error instanceof Error ? error : new Error(String(error))
            agent.resolveAiConfirmStep(requestId, false)
          }
        })
      }
    }
  }

  const previousPolls = process.env.AISS_MAX_POLLS
  if (input.fixture.env?.AISS_MAX_POLLS) process.env.AISS_MAX_POLLS = input.fixture.env.AISS_MAX_POLLS
  try {
    await agent.runOpenClawCoreAgentChat(
      wc as unknown as Parameters<AgentModule['runOpenClawCoreAgentChat']>[0],
      settings,
      {
        messages: input.history,
        targetSessionId: input.sessionId,
        historyKey: input.fixture.session.historyKey,
        debugTurnId: `${input.fixture.id}-${input.turn.turnId}`,
        hostInventoryId: input.fixture.seedInventory?.hostId || input.fixture.hostProfile?.hostId
      },
      ssh as unknown as Parameters<AgentModule['runOpenClawCoreAgentChat']>[3]
    )
  } finally {
    globalThis.fetch = previousFetch
    if (previousPolls == null) delete process.env.AISS_MAX_POLLS
    else process.env.AISS_MAX_POLLS = previousPolls
  }
  if (confirmError) throw confirmError
  const failed = events.find((event) => event.type === 'error')
  if (failed && failed.type === 'error') throw new Error(`${input.turn.turnId}: ${failed.message}`)
  return { events, prompts, requests, writes, served }
}

function assistantLines(events: AiStreamEvent[]): AiChatMessage[] {
  const lines: AiChatMessage[] = []
  for (const event of events) {
    if (event.type === 'step') lines.push({ role: 'assistant', content: event.structured.description })
  }
  return lines
}

function stepActions(events: AiStreamEvent[]): string[] {
  return events.filter((event) => event.type === 'step').map((event) => (event.type === 'step' ? event.structured.action : ''))
}

function snapshotCount(events: AiStreamEvent[]): number {
  return events.filter(
    (event) => event.type === 'step' && event.structured.action === 'tool_call' && event.structured.toolName === 'get_terminal_snapshot'
  ).length
}

function maxConsecutiveSnapshots(events: AiStreamEvent[]): number {
  let run = 0
  let max = 0
  for (const event of events) {
    if (event.type !== 'step') continue
    const snap = event.structured.action === 'tool_call' && event.structured.toolName === 'get_terminal_snapshot'
    run = snap ? run + 1 : 0
    max = Math.max(max, run)
  }
  return max
}

function assertExpectation(
  turn: Turn,
  result: DriveResult,
  autoApproveLowRisk: boolean,
  scope?: { hostId?: string; sessionId?: string }
): void {
  const expected = turn.expected
  if (!expected) return
  const label = turn.turnId
  for (const prompt of result.prompts) {
    assert.match(goalLine(prompt), /\S/, `${label}: working memory goal missing`)
  }
  const context = result.events.filter((event) => event.type === 'debug' && event.payload.entry.kind === 'context')
  assert.ok(context.length > 0, `${label}: debugTurnId produced no context slices`)
  for (const event of context) {
    if (event.type !== 'debug' || event.payload.entry.kind !== 'context') continue
    const working = event.payload.entry.slices.find((slice) => slice.name === 'working')
    assert.ok(working && working.chars > 0, `${label}: working-memory slice is empty`)
  }
  if (expected.minPlannerSteps != null) {
    assert.ok(result.prompts.length >= expected.minPlannerSteps, `${label}: ${result.prompts.length} planner steps`)
  }
  if (expected.maxPlannerSteps != null) {
    assert.ok(result.prompts.length <= expected.maxPlannerSteps, `${label}: ${result.prompts.length} planner steps`)
  }
  const actions = stepActions(result.events)
  if (expected.actionSequenceContains) {
    assert.ok(subsequence(actions, expected.actionSequenceContains), `${label}: actions ${actions.join(',')}`)
  }
  if (expected.firstEvidenceAction) assert.equal(actions[0], expected.firstEvidenceAction, label)
  const ended = [...result.events].reverse().find((event) => event.type === 'step' && event.structured.action === 'end')
  if (expected.finalAction === 'end' || expected.mustTerminate) {
    assert.ok(ended && ended.type === 'step', `${label}: did not end`)
  }
  if (ended && ended.type === 'step') {
    if (expected.completed != null) assert.equal(ended.structured.completed, expected.completed, label)
    for (const pattern of expected.descriptionMustContain ?? []) {
      assert.match(ended.structured.description, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), label)
    }
    for (const pattern of expected.descriptionMustNotContain ?? []) {
      assert.equal(violates(ended.structured.description, pattern), false, `${label}: description contains ${pattern}`)
    }
    if (expected.descriptionMustMatchAny?.length) {
      assert.ok(
        expected.descriptionMustMatchAny.some((pattern) => ended.structured.description.includes(pattern)),
        `${label}: end description matched none of ${expected.descriptionMustMatchAny.join(' | ')}`
      )
    }
  }
  const commands = [...(expected.commandsRequiringConfirm ?? []), ...(expected.forbiddenCommands ?? []), ...(expected.mustNotEmitCommands ?? [])]
  for (const command of expected.commandsRequiringConfirm ?? []) {
    assert.ok(result.writes.includes(`${command}\n`), `${label}: missing confirmed write ${command}`)
    const step = result.events.find((event) => event.type === 'step' && event.structured.command === command)
    assert.ok(step && step.type === 'step' && step.requestId, `${label}: ${command} had no requestId`)
    assert.notEqual(step && step.type === 'step' ? step.autoApproved : true, true)
  }
  for (const command of [...(expected.forbiddenCommands ?? []), ...(expected.mustNotEmitCommands ?? [])]) {
    assert.equal(
      result.writes.some((write) => write.includes(command)),
      false,
      `${label}: forbidden command written: ${command}`
    )
  }
  void commands
  if (expected.maxConsecutiveGetTerminalSnapshot != null) {
    assert.ok(maxConsecutiveSnapshots(result.events) <= expected.maxConsecutiveGetTerminalSnapshot, label)
  }
  const snaps = snapshotCount(result.events)
  if (expected.maxGetTerminalSnapshot != null) assert.ok(snaps <= expected.maxGetTerminalSnapshot, `${label}: ${snaps} snaps`)
  if (expected.maxGetTerminalSnapshotExecuted != null) {
    assert.ok(snaps <= expected.maxGetTerminalSnapshotExecuted, `${label}: ${snaps} snaps`)
    assert.ok(result.prompts.length < 10, `${label}: spun to the poll cap`)
  }
  const remembered = result.prompts.join('\n')
  for (const fact of [...(expected.memoryMustRetain ?? []), ...(expected.memoryMustStillRetainFromT1 ?? [])]) {
    assert.ok(remembered.includes(fact), `${label}: prompt dropped ${fact}`)
  }
  for (const fact of expected.plannerPromptMustNotContain ?? []) {
    assert.equal(remembered.includes(fact), false, `${label}: planner prompt leaked ${fact}`)
  }
  for (const step of turn.mockedPlannerSteps ?? []) {
    for (const fact of step.expectToolResultContains ?? []) {
      assert.ok(result.prompts.some((prompt) => prompt.includes(fact)) || result.served.some((text) => text.includes(fact)), `${label}: tool result missing ${fact}`)
    }
  }
  const goals = result.prompts.map(goalLine).join('\n')
  for (const phrase of expected.workingMemoryAfter?.goalMentions ?? []) assert.match(goals, new RegExp(phrase))
  const goalAny = expected.sessionIntent?.goalContainsAnyOf
  if (goalAny?.length) {
    assert.ok(goalAny.some((phrase) => goals.includes(phrase)), `${label}: goal matched none of ${goalAny.join(' | ')}`)
  }
  for (const phrase of expected.intentSwitch?.newGoalMentions ?? []) assert.match(goals, new RegExp(phrase))
  if (expected.intentSwitch?.archiveOldWorkingMemory) assert.match(remembered, /archived-goal/)
  for (const phrase of expected.activeGoalMustNotBe ?? []) assert.equal(goals.includes(phrase), false, `${label}: goal still ${phrase}`)
  if (expected.confirmGate?.required) {
    const command = result.events.find((event) => event.type === 'step' && event.structured.action === 'command')
    assert.ok(command && command.type === 'step' && command.requestId, `${label}: confirm gate missing requestId`)
    assert.notEqual(command && command.type === 'step' ? command.autoApproved : true, true)
    if (expected.confirmGate.riskLevel) assert.equal(command && command.type === 'step' ? command.structured.riskLevel : '', expected.confirmGate.riskLevel)
    if (expected.confirmGate.settingsAutoApproveLowRisk != null) {
      assert.equal(autoApproveLowRisk, expected.confirmGate.settingsAutoApproveLowRisk)
    }
  }
  if (expected.ipc) {
    const types = result.events.map((event) => event.type)
    assert.ok(subsequence(types, expected.ipc), `${label}: events ${types.join(',')} missing ${expected.ipc.join(',')}`)
  }
  if (expected.ipcMustNotInclude) {
    const types = result.events.map((event) => event.type)
    for (const kind of expected.ipcMustNotInclude) {
      assert.equal(types.includes(kind), false, `${label}: unexpected event ${kind}`)
    }
  }
  if (expected.sshWriteCount != null) assert.equal(result.writes.length, expected.sshWriteCount, label)
  if (expected.noFurtherPlannerStepsAfterDeny) {
    const commandAt = (turn.mockedPlannerSteps ?? []).findIndex((step) => step.response.action === 'command')
    assert.equal(result.prompts.length, commandAt + 1, `${label}: planner continued after decline`)
  }
  if (expected.riskLevel) {
    const command = result.events.find((event) => event.type === 'step' && event.structured.action === 'command')
    assert.ok(command && command.type === 'step')
    assert.equal(command.structured.riskLevel, expected.riskLevel)
  }
  if (expected.observationalMemoryMustContain?.length || expected.recentWindowMustNotContain?.length) {
    assert.ok(result.requests.length > 0, `${label}: no planner request`)
    for (const messages of result.requests) {
      const prompt = systemText(messages)
      const observed = observationalSection(prompt)
      for (const fact of expected.observationalMemoryMustContain ?? []) {
        assert.ok(observed.includes(fact), `${label}: observational memory dropped ${fact}`)
      }
      const recent = messages
        .filter((message) => message.role !== 'system')
        .map((message) => message.content)
        .join('\n')
      for (const fact of expected.recentWindowMustNotContain ?? []) {
        assert.equal(recent.includes(fact), false, `${label}: recent window still has ${fact}`)
      }
    }
  }
  if (expected.hitl) {
    const lines = hitlLines(result.events)
    const interrupts = lines.filter((line) => line.includes('phase=interrupted'))
    if (expected.hitl.minInterrupts != null) {
      assert.ok(interrupts.length >= expected.hitl.minInterrupts, `${label}: ${interrupts.length} interrupts`)
    }
    if (expected.hitl.resume) {
      assert.ok(
        lines.some((line) => line.includes(`decision=${expected.hitl?.resume}`)),
        `${label}: missing HITL resume ${expected.hitl.resume}`
      )
    }
    if (expected.hitl.decisions) {
      const decisions = lines
        .map((line) => /decision=(approve|deny)/.exec(line)?.[1])
        .filter((item): item is 'approve' | 'deny' => item === 'approve' || item === 'deny')
      assert.deepEqual(decisions, expected.hitl.decisions, `${label}: HITL decisions ${decisions.join(',')}`)
    }
    const risks = interrupts.map((line) => /risk=(\S+)/.exec(line)?.[1] ?? '')
    for (const risk of expected.hitl.interruptRisks ?? []) {
      assert.ok(risks.includes(risk), `${label}: interrupt risks ${risks.join(',')} missing ${risk}`)
    }
    assert.equal(
      lines.some((line) => line.includes('get_terminal_snapshot') && line.includes('phase=interrupted')),
      false,
      `${label}: snapshot was interrupted`
    )
  }
  if (!expected.ipc) assert.ok(result.events.some((event) => event.type === 'done'), `${label}: missing done`)
  assertHostState(turn, scope?.hostId)
  assertMidChainDeny(turn, result, scope)
}

function hostBlob(hostId: string): string {
  const rec = inventory.getInventoryStore().get(hostId)
  if (!rec) return ''
  return [
    rec.notesMarkdown,
    ...rec.services.map((service) => `${service.name} ${service.kind} ${service.notes ?? ''}`)
  ].join('\n')
}

function assertHostState(turn: Turn, hostId: string | undefined): void {
  const spec = turn.expected?.hostState
  if (!spec) return
  const label = turn.turnId
  assert.ok(hostId, `${label}: hostState without a host id`)
  const rec = inventory.getInventoryStore().get(hostId)
  assert.ok(rec, `${label}: host record missing`)
  if (!rec) return
  if (spec.serviceNames) {
    assert.deepEqual(
      rec.services.map((service) => service.name),
      spec.serviceNames,
      `${label}: services ${rec.services.map((service) => service.name).join(',')}`
    )
  }
  if (spec.notesEqual) {
    assert.equal(rec.notesMarkdown, spec.notesEqual.join('\n'), `${label}: host notes changed`)
  }
  for (const fact of spec.notesMustContain ?? []) {
    assert.ok(rec.notesMarkdown.includes(fact), `${label}: host notes missing ${fact}`)
  }
  for (const fact of spec.notesMustNotContain ?? []) {
    assert.equal(rec.notesMarkdown.includes(fact), false, `${label}: host notes contain ${fact}`)
  }
}

/**
 * Deny in the middle of a chain is not execution. An earlier approved command
 * may remain. The denied command must not be written, even as a prefix, and
 * later steps must not leave a file or host leftover or a success claim.
 * Stopping (cancelled, no end) and a replan that ends without those leftovers
 * both pass. 证据不足 is not required when the chain already stopped.
 */
function assertMidChainDeny(
  turn: Turn,
  result: DriveResult,
  scope?: { hostId?: string; sessionId?: string }
): void {
  const spec = turn.expected?.midChainDeny
  if (!spec) return
  const label = turn.turnId
  const denied = spec.deniedCommand
  assert.equal(
    result.writes.some((write) => write.includes(denied)),
    false,
    `${label}: denied command was written`
  )
  for (const write of result.writes) {
    const body = write.replace(/\s+$/g, '')
    const half = body.length > 0 && body !== denied && denied.startsWith(body)
    assert.equal(half, false, `${label}: half-written prefix of denied command: ${body}`)
  }
  for (const command of spec.laterCommands ?? []) {
    assert.equal(
      result.writes.some((write) => write.includes(command)),
      false,
      `${label}: later command written after deny: ${command}`
    )
  }
  assert.ok(scope?.sessionId, `${label}: mid-chain deny without a session id`)
  const persisted = scope?.sessionId ? loadPersistedCoreSession(scope.sessionId) : null
  assert.ok(persisted, `${label}: session memory missing after deny`)
  const recent = persisted?.recentCommands ?? []
  assert.equal(
    recent.some((command) => command.includes(denied)),
    false,
    `${label}: denied command recorded as a successful run`
  )
  for (const command of spec.keptCommands ?? []) {
    assert.ok(
      result.writes.some((write) => write.includes(command)),
      `${label}: approved command missing from writes: ${command}`
    )
    assert.ok(recent.some((item) => item.includes(command)), `${label}: approved command missing from recent commands: ${command}`)
  }
  const ends = result.events.filter((event) => event.type === 'step' && event.structured.action === 'end')
  const endText = ends.map((event) => (event.type === 'step' ? event.structured.description : '')).join('\n')
  const sent = result.events
    .filter((event) => event.type === 'debug' && event.payload.entry.kind === 'execution')
    .map((event) => (event.type === 'debug' ? `${event.payload.entry.label}\n${event.payload.entry.detail ?? ''}` : ''))
    .filter((line) => line.includes('writeOk=true'))
    .join('\n')
  const surface = [
    result.writes.join('\n'),
    result.served.join('\n'),
    (persisted?.observations ?? []).join('\n'),
    recent.join('\n'),
    scope?.hostId ? hostBlob(scope.hostId) : '',
    endText,
    sent
  ].join('\n')
  for (const marker of spec.leftoverMarkers) {
    assert.equal(surface.includes(marker), false, `${label}: leftover marker ${marker}`)
  }
  const cancelled = result.events.some((event) => event.type === 'cancelled')
  if (ends.length === 0) {
    assert.equal(cancelled, true, `${label}: deny did not stop or replan`)
    return
  }
  assert.equal(endText.includes(denied), false, `${label}: replan treated the denied command as done`)
}

async function runTurns(fixture: Fixture, turns: Turn[]): Promise<void> {
  const history: AiChatMessage[] = []
  for (const turn of turns) {
    history.push({ role: 'user', content: turn.userMessage })
    try {
      const result = await drive({
        fixture,
        turn,
        sessionId: fixture.session.targetSessionId,
        history,
        approve: turn.userConfirm?.policy !== 'deny'
      })
      assertExpectation(turn, result, false, {
        hostId: fixture.seedInventory?.hostId || fixture.hostProfile?.hostId,
        sessionId: fixture.session.targetSessionId
      })
      history.push(...assistantLines(result.events))
    } catch (error) {
      rethrowWithDraft(turn.turnId, error)
    }
  }
}

function rethrowWithDraft(turnId: string, error: unknown): never {
  throw annotateUnappliedFailure(error, {
    gate: 'core-a-eval',
    name: turnId,
    message: error instanceof Error ? error.message : String(error)
  })
}

/**
 * S15: a failing npm/eval gate explains itself, then the patch stays a proposal.
 * Agree writes the harness mock. Decline leaves that tree unchanged.
 */
function assertTfl(fixture: Fixture): void {
  const spec = fixture.tfl
  assert.ok(spec, `${fixture.id}: missing tfl spec`)
  const label = fixture.id
  const started = { ...spec.mockTree }
  const reviewedOn = createMockTree(spec.mockTree)
  const review = reviewNpmTestFailure(spec.npmOutput, reviewedOn)
  assert.ok(review, `${label}: npm test failure was not recognized`)
  assert.equal(reviewedOn.writeCount(), 0, `${label}: explaining the failure wrote the mock`)
  assert.equal(review.hitl.phase, 'interrupted', `${label}: draft did not interrupt`)
  assert.equal(patchWritePermitted(review.hitl), false, `${label}: interrupted draft is writable`)
  assert.equal(sideEffectExecutionPermitted(review.hitl), false, `${label}: patch draft opened the SSH write path`)
  for (const fact of spec.explanationMustContain) {
    assert.ok(review.draft.explanation.includes(fact), `${label}: explanation missing ${fact}`)
  }
  for (const fact of spec.explanationMustNotContain ?? []) {
    assert.equal(review.draft.explanation.includes(fact), false, `${label}: explanation leaked ${fact}`)
  }
  assert.ok(review.draft.hunks.length > 0, `${label}: no patch draft`)
  const card = patchDraftConfirmCard(review)
  assert.equal(card.autoApproved, false, `${label}: patch card was auto-approved`)
  assert.ok(card.requestId, `${label}: patch card has no confirm id`)
  assert.equal(card.riskLevel, 'high')
  assert.ok(card.command.includes('+++'), `${label}: confirm card has no diff`)
  const blocked = applyPatchDraft(review.hitl, review.draft, reviewedOn)
  assert.equal(blocked.applied, false, `${label}: interrupted draft applied`)
  assert.equal(reviewedOn.writeCount(), 0, `${label}: interrupted draft wrote`)
  assert.deepEqual(reviewedOn.snapshot(), started, `${label}: review tree changed`)

  const declineTree = createMockTree(spec.mockTree)
  const declined = decidePatch(review, false, declineTree)
  assert.equal(declined.state.phase, 'cancelled')
  assert.equal(declined.state.resume, 'deny')
  assert.equal(declined.applied, false)
  assert.deepEqual(declined.written, [])
  assert.equal(declineTree.writeCount(), 0, `${label}: decline wrote`)
  assert.deepEqual(declineTree.snapshot(), started, `${label}: decline changed the tree`)

  const agreeTree = createMockTree(spec.mockTree)
  const agreed = decidePatch(review, true, agreeTree)
  assert.equal(agreed.state.phase, 'executing')
  assert.equal(agreed.state.resume, 'approve')
  assert.equal(agreed.applied, true, `${label}: agree did not apply the draft`)
  assert.ok(agreed.written.length > 0, `${label}: agree wrote no path`)
  assert.equal(sideEffectExecutionPermitted(agreed.state), false, `${label}: agreed patch became an SSH write`)
  assert.equal(patchWritePermitted(agreed.state), true)
  const body = agreeTree.snapshot()[agreed.written[0] ?? ''] ?? ''
  for (const fact of spec.agreeMustContain ?? []) {
    assert.ok(body.includes(fact), `${label}: agreed file missing ${fact}`)
  }
  assert.deepEqual(declineTree.snapshot(), started, `${label}: agree mutated the declined tree`)
}

describe('Core-A eval fixtures', { concurrency: 1 }, () => {
  before(async () => {
    agent = await import('../src/main/ai-interactive-agent.ts')
    inventory = await import('../src/main/inventory-store.ts')
  })

  const fixtures = loadFixtures()

  for (const fixture of fixtures) {
    it(`${fixture.id} ${fixture.title}`, async () => {
      assert.equal(fixture.settings?.autoApproveLowRisk, false, `${fixture.id} autoApproveLowRisk`)
      if (fixture.tfl) {
        assertTfl(fixture)
        return
      }
      const turns = fixture.turns ?? []
      assert.ok(turns.length, `${fixture.id} has no turns`)
      if (fixture.isolationPrelude) {
        const prelude = fixture.isolationPrelude
        const preludeFixture: Fixture = {
          ...fixture,
          hostProfile: prelude.hostProfile ?? fixture.hostProfile,
          session: prelude.session,
          seedInventory: prelude.seedInventory
        }
        seedInventory(preludeFixture)
        await runTurns(preludeFixture, prelude.turns)
      }
      seedInventory(fixture)
      await runTurns(fixture, turns)
      if (fixture.negativeCase) {
        const sample = turns[0]
        const turn: Turn = {
          ...fixture.negativeCase,
          userMessage: fixture.negativeCase.userMessage || sample?.userMessage || '',
          mockTerminal: fixture.negativeCase.mockTerminal || sample?.mockTerminal,
          mockedPlannerSteps: fixture.negativeCase.mockedPlannerSteps || sample?.mockedPlannerSteps
        }
        try {
          const result = await drive({
            fixture,
            turn,
            sessionId: `${fixture.session.targetSessionId}-deny`,
            history: [{ role: 'user', content: turn.userMessage }],
            approve: false
          })
          assertExpectation(turn, result, false, {
            hostId: fixture.seedInventory?.hostId || fixture.hostProfile?.hostId,
            sessionId: `${fixture.session.targetSessionId}-deny`
          })
        } catch (error) {
          rethrowWithDraft(turn.turnId, error)
        }
      }
      if (fixture.regressionCase) {
        const sample = turns[0]
        const reg = fixture.regressionCase
        const turn: Turn = {
          turnId: reg.turnId,
          userMessage: reg.userMessage || sample?.userMessage || '',
          mockTerminal: reg.mockTerminal || sample?.mockTerminal,
          userConfirm: reg.userConfirm ?? sample?.userConfirm,
          mockedPlannerSteps: reg.mockedPlannerSteps || sample?.mockedPlannerSteps,
          expected: reg.expected
        }
        const regFixture: Fixture = {
          ...fixture,
          hostProfile: reg.hostProfile ?? fixture.hostProfile,
          session: reg.session ?? {
            targetSessionId: `${fixture.session.targetSessionId}-approve`,
            historyKey: `${fixture.session.historyKey}-approve`
          },
          seedInventory: reg.seedInventory ?? fixture.seedInventory,
          regressionCase: undefined
        }
        seedInventory(regFixture)
        await runTurns(regFixture, [turn])
      }
    })
  }
})
