/**
 * Core-A multi-turn evals. Every `*.json` file in tests/fixtures/core-a/ is a
 * scenario (S1–S12 and any later drop-in). The real planner runs against the
 * fixture's scripted model and a fake terminal.
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
  sshWriteCount?: number
  noFurtherPlannerStepsAfterDeny?: boolean
  riskLevel?: string
}

type Turn = {
  turnId: string
  userMessage: string
  mockTerminal?: { initialRing?: string; afterWrite?: Record<string, string> }
  userConfirm?: { policy?: string; assert?: { stepHasRequestId?: boolean; autoApproved?: boolean; sshWriteBeforeApprove?: boolean; riskLevelMustBe?: string } }
  mockedPlannerSteps?: PlannerStep[]
  expected?: Expectation
}

type Fixture = {
  id: string
  title: string
  hostProfile?: { hostId?: string; label?: string; hostname?: string }
  session: { targetSessionId: string; historyKey: string }
  settings?: { autoApproveLowRisk?: boolean; useOpenClaw?: boolean }
  env?: Record<string, string>
  seedInventory?: {
    hostId: string
    services?: Array<{ name: string; kind?: string; ports?: number[]; notes?: string; unit?: string }>
    notes?: string[]
  }
  turns: Turn[]
  negativeCase?: Turn
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
  const writes: string[] = []
  const served: string[] = []
  const replies = (input.turn.mockedPlannerSteps ?? []).map((step) => JSON.stringify(step.response))
  const afterWrite = input.turn.mockTerminal?.afterWrite ?? {}
  let lastCommand = ''
  let confirmError: Error | null = null
  const policy = input.turn.userConfirm?.policy ?? 'approve-all-commands'
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
    prompts.push(systemText(parsed.messages ?? []))
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
            agent.resolveAiConfirmStep(requestId, input.approve)
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
  return { events, prompts, writes, served }
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

function assertExpectation(turn: Turn, result: DriveResult, autoApproveLowRisk: boolean): void {
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
  if (!expected.ipc) assert.ok(result.events.some((event) => event.type === 'done'), `${label}: missing done`)
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
      assert.ok(fixture.turns?.length, `${fixture.id} has no turns`)
      seedInventory(fixture)
      const history: AiChatMessage[] = []
      for (const turn of fixture.turns) {
        history.push({ role: 'user', content: turn.userMessage })
        const result = await drive({
          fixture,
          turn,
          sessionId: fixture.session.targetSessionId,
          history,
          approve: true
        })
        assertExpectation(turn, result, false)
        history.push(...assistantLines(result.events))
      }
      if (fixture.negativeCase) {
        const sample = fixture.turns[0]
        const turn: Turn = {
          ...fixture.negativeCase,
          userMessage: fixture.negativeCase.userMessage || sample?.userMessage || '',
          mockTerminal: fixture.negativeCase.mockTerminal || sample?.mockTerminal,
          mockedPlannerSteps: fixture.negativeCase.mockedPlannerSteps || sample?.mockedPlannerSteps
        }
        const result = await drive({
          fixture,
          turn,
          sessionId: `${fixture.session.targetSessionId}-deny`,
          history: [{ role: 'user', content: turn.userMessage }],
          approve: false
        })
        assertExpectation(turn, result, false)
      }
    })
  }
})
