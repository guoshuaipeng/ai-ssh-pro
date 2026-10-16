/**
 * Core-A multi-turn evals. Every `*.json` file in tests/fixtures/core-a/ is a
 * scenario (S1–S24 and any later drop-in, including S20-N). The real planner
 * runs against the fixture's scripted model and a fake terminal.
 * S20: after contradictory filler, observational memory still has the original
 * rare-fact tokens, and the end must not adopt the filler's path, Use%, or host state.
 * S21: denying one HITL step mid-chain does not write that step or a later
 * file/host update, and does not treat the deny as success. The same chain
 * with every step approved still completes.
 * S22: a red unit test explains itself in human language and opens a
 * confirm-style patch draft. The factory does not auto-apply. Deny leaves
 * no patch on disk, and a half-written change is not success.
 * S23: cancelling an HITL interrupt mid-plan is not a deny and not an execution.
 * The loop returns to planning with no sticky interrupt. The next user turn can
 * plan again. 证据不足 is only for a turn whose evidence is actually missing.
 * Cancelled steps are not written and are not stored in recentCommands.
 * S24: a rare fact and recent command remembered on host A are not evidence on
 * host B. Host B ends with 证据不足. The same host A thread still recalls the fact.
 * S25: observational-memory budget and truncation are on the context debug event.
 * A tight bullet cap still keeps the rare fact, host B does not inherit it, and
 * confirm-before-run stays on.
 * S26: the working-memory scratchpad (goal, constraints, host facts) stays in the
 * planner prompt after observational bullets are truncated, and stays on the
 * host that recorded it. Confirm-before-run stays on.
 * S27: a confirmed command that fails (nonzero, stderr, or timeout) is explained
 * with that evidence. The same command is not written again unless a new
 * confirm is approved. Deny and cancel of that retry write nothing. Cancel
 * stays plannable and is not a deny (S23).
 * S28: the same failed command has a retry budget. Two confirmed failures
 * reach the cap. A further write of that path does not run; the end cites
 * the failure evidence and says the budget is exhausted. Each retry that is
 * still inside the budget needs a new confirm. Deny and cancel do not write.
 * S29: a confirmed command with a very long stdout, stderr, or ring is shown
 * to the planner truncated. A rare evidence marker in the middle or at the
 * end stays citeable. The end cites that marker and does not invent an absent
 * line. Confirm-before-run stays on. Another host does not inherit the marker.
 * The same command is not written again without a new confirm.
 * S30: that cite window stays stable under observational compression. A scarce
 * marker outside the naive head cut remains citeable after the bullet budget
 * drops filler. Dropped filler does not come back as a cite. Confirm-before-run
 * stays on. Another host does not inherit the marker.
 * S31: the same hold stays stable when a later turn in that host session forces
 * observational memory to compress again. The scarce marker stays in the
 * bullet and the end. Filler the cite window already dropped is not cited again.
 * S32: after that hold is stable, a later turn drafts a confirm-style patch.
 * The draft still cites the held marker. Dropped filler is not cited again.
 * Confirm-before-run stays on. Another host does not inherit the marker.
 * S33: agreeing that card writes the same cite. The applied bytes still name
 * the held marker. Filler the cite window already dropped is not written back.
 * `citeHold.stable` stays true. Agree requires a real requestId. Deny still
 * writes nothing. Drafting does not open SSH. Another host does not inherit
 * the marker.
 *
 * Run: npx tsx --test scripts/test-core-a-evals.ts
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
import {
  classifyCommandFailure,
  explainFailedCommand,
  explainRetryBudgetStop,
  observeRetryBudget,
  RETRY_BUDGET_CAP,
  retryWritePermitted
} from '../src/main/core-a-command-failure.ts'
import {
  citeHeldAppliedWrite,
  citeHeldPatchDraft,
  citeObservationLine,
  explainCiteableOutput,
  OUTPUT_VIEW_CAP,
  outputViewCap,
  rollback,
  tipSuggest,
  truncateCiteableOutput,
  type CiteWindow
} from '../src/main/core-a-output-truncate.ts'
import {
  cancelHitl,
  compactTranscript,
  createHitlLoop,
  EMPTY_THREAD,
  hitlIsPlannable,
  interruptForProposal,
  markHitlExecuting,
  patchWritePermitted,
  resumeHitl,
  sideEffectExecutionPermitted,
  type ObservationBullet,
  type TranscriptTurn
} from '../src/main/core-a-context.ts'
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
  /**
   * S26: tokens that must appear in the working-memory scratchpad injected
   * into the planner prompt (goal / constraints / hostFacts), not only in
   * observational bullets.
   */
  workingMemoryMustContain?: string[]
  /** S26: another host's scratchpad must not be injected or persisted here. */
  workingMemoryMustNotContain?: string[]
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
  /** Observational-memory section must still contain these tokens (S13 / S16 / S20 / S24). */
  observationalMemoryMustContain?: string[]
  /** S24: another host's bullets must not be in this host's observational memory. */
  observationalMemoryMustNotContain?: string[]
  recentWindowMustNotContain?: string[]
  /** System prompt must not carry another host's facts (S18 / S24). */
  plannerPromptMustNotContain?: string[]
  /** S24: the "最近已执行命令" evidence block, not the whole prompt. */
  recentCommandEvidenceMustContain?: string[]
  recentCommandEvidenceMustNotContain?: string[]
  /**
   * S23: cancel mid-plan. The cancelled command is not a write and not a deny.
   * The loop is plannable again. Later scripted steps must not land.
   */
  midChainCancel?: {
    cancelledCommand: string
    keptCommands?: string[]
    laterCommands?: string[]
    leftoverMarkers: string[]
  }
  /** S23 next turn: a real plan. 证据不足 only when this turn has no evidence. */
  freshPlan?: { evidencePresent?: boolean }
  /**
   * S25: observational-memory budget on the context debug event.
   * The harness can see drops, cuts, and whether the thread is near a cap.
   */
  omBudget?: {
    truncated?: boolean
    nearBudget?: boolean
    summaryTruncated?: boolean
    minDroppedBullets?: number
    minTruncatedBullets?: number
    bulletCap?: number
  }
  recentCommandsMustContain?: string[]
  recentCommandsMustNotContain?: string[]
  /**
   * S27: a confirmed command failed. The next planner prompt cites the evidence
   * and says not to auto-retry. Writes of that command equal approvals, each
   * with its own requestId. The end cites the evidence when the turn ends.
   */
  commandFailure?: {
    command: string
    evidence: string[]
    writeCount: number
    minDistinctRequestIds: number
    endCitesEvidence?: boolean
  }
  /**
   * S28: consecutive confirmed failures of one command. The last context
   * debug event carries `count` and `cap`. Over budget, a later proposal of
   * that command is not a confirm card and is not a write.
   */
  retryBudget?: {
    count: number
    cap: number
    exhausted: boolean
    nearBudget: boolean
    /** An earlier context event still had room for one confirmed retry. */
    sawApproach?: boolean
    /** Confirm cards opened for `commandFailure.command`. */
    confirmCards?: number
    /** The planner proposed the same path again after the cap. That write did not happen. */
    blockedWrite?: boolean
  }
  /**
   * S29: a long stdout, stderr, or ring is truncated for the planner.
   * The last context debug event carries the cap and the kept markers.
   * Filler that sat only in the dropped middle is absent from that prompt.
   */
  outputView?: {
    truncated: boolean
    cap?: number
    minOriginalChars?: number
    markers?: string[]
    keptInPrompt?: string[]
    droppedFromPrompt?: string[]
    /** Still present in the raw ring the terminal served. */
    presentInRaw?: string[]
    tipSuggest?: string
    rollback?: string
    /** Scarce markers outside the naive head and tail, and filler that must stay dropped. */
    citeWindow?: {
      stable?: boolean
      outsideHeadTail?: string[]
      droppedFiller?: string[]
    }
  }
  /**
   * S30: the cite window after observational compression. The last context
   * debug event carries `outputView.citeHold`. Scarce markers stay in
   * observational memory. Dropped filler is not cited.
   */
  citeHold?: {
    stable?: boolean
    head?: number
    outsideHeadTail?: string[]
    droppedFiller?: string[]
  }
  hitl?: {
    minInterrupts?: number
    resume?: 'approve' | 'deny' | 'cancel'
    /** Resume decisions in confirm order. Cancel ≠ deny ≠ an executed step. */
    decisions?: Array<'approve' | 'deny' | 'cancel'>
    interruptRisks?: string[]
    /** After cancel, phase is planning and no confirm is still waiting. */
    plannableAfterCancel?: boolean
    /** Deny or cancel left no confirm waiting, so the next turn can plan. */
    released?: boolean
  }
}

type Turn = {
  turnId: string
  userMessage: string
  mockTerminal?: {
    initialRing?: string
    afterWrite?: Record<string, string>
    /** Structured result of a confirmed command. Stdout that merely says "failed" is not this. */
    commandOutcome?: Record<string, { exitCode?: number | null; stderr?: string; timedOut?: boolean; timeoutMark?: string }>
  }
  userConfirm?: {
    policy?: string
    /** Per confirm, in order. `per-step` fails closed once this list runs out. `cancel` is not a deny. */
    decisions?: Array<'approve' | 'deny' | 'cancel'>
    assert?: { stepHasRequestId?: boolean; autoApproved?: boolean; sshWriteBeforeApprove?: boolean; riskLevelMustBe?: string }
  }
  mockedPlannerSteps?: PlannerStep[]
  expected?: Expectation
}

type BranchTurn = Turn & {
  session?: Fixture['session']
  hostProfile?: Fixture['hostProfile']
  seedInventory?: Fixture['seedInventory']
}

type TflSpec = {
  npmOutput: string
  mockTree: Record<string, string>
  explanationMustContain: string[]
  explanationMustNotContain?: string[]
  agreeMustContain?: string[]
  /** Tokens the agreed bytes must not cite. Dropped filler and absent lines. */
  agreeMustNotContain?: string[]
  /**
   * S22: confirm-before-apply. The review factory does not write. Deny leaves
   * the temp disk and the repo fixture bytes unchanged. A half-written hunk
   * is not a successful apply.
   */
  confirmBeforeApply?: boolean
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
  negativeCase?: BranchTurn
  /**
   * S21: the same planner chain with every confirm approved, on its own host
   * and history key so the deny case cannot leave state behind for it.
   */
  regressionCase?: BranchTurn
  /**
   * S27: cancel the retry on its own host. Cancel is not a deny. The loop is
   * plannable again and the retry is not written.
   */
  cancelCase?: BranchTurn
  /**
   * S28: the same path is proposed again after the retry budget is spent.
   * That proposal is not written.
   */
  overBudgetCase?: BranchTurn
  /**
   * S18: seed a fact on another historyKey / hostInventoryId before the main turns.
   * Main-turn prompts must not contain that host's rare service or port.
   * S24: the prelude writes a rare fact into observational memory on host A.
   */
  isolationPrelude?: {
    hostProfile?: { hostId?: string; label?: string; hostname?: string }
    session: { targetSessionId: string; historyKey: string }
    seedInventory?: Fixture['seedInventory']
    turns: Turn[]
  }
  /**
   * S24: after the main host's turns, ask again on the prelude host.
   * Same historyKey and session as the prelude. Host B must not have wiped it.
   */
  hostScopeReturn?: {
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

function workingMemorySection(prompt: string): string {
  return blockAfter(prompt, '工作记忆（当前目标）：') || blockAfter(prompt, 'Working memory (current goal):')
}

/** Lines under a single prompt label, stopping at the next section heading. */
function labeledBlock(prompt: string, label: string): string {
  const at = prompt.indexOf(label)
  if (at < 0) return ''
  const rest = prompt.slice(at + label.length).replace(/^\n/, '')
  const lines: string[] = []
  for (const line of rest.split('\n')) {
    const heading = /：$/.test(line) || (/:\s*$/.test(line) && !line.startsWith('-'))
    if (heading && lines.length > 0) break
    lines.push(line)
  }
  return lines.join('\n').trim()
}

function recentCommandEvidence(prompt: string): string {
  return labeledBlock(prompt, '最近已执行命令：') || labeledBlock(prompt, 'Recently executed commands:')
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
  confirms: Array<{ requestId: string; command: string; decision: 'approve' | 'deny' | 'cancel' }>
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
  const confirms: Array<{ requestId: string; command: string; decision: 'approve' | 'deny' | 'cancel' }> = []
  const replies = (input.turn.mockedPlannerSteps ?? []).map((step) => JSON.stringify(step.response))
  const afterWrite = input.turn.mockTerminal?.afterWrite ?? {}
  const commandOutcome = input.turn.mockTerminal?.commandOutcome ?? {}
  let lastCommand = ''
  let confirmError: Error | null = null
  const policy = input.turn.userConfirm?.policy ?? 'approve-all-commands'
  const decisions = [...(input.turn.userConfirm?.decisions ?? [])]
  const takeDecision = (): 'approve' | 'deny' | 'cancel' => {
    const next = decisions.shift()
    if (next === 'approve' || next === 'deny' || next === 'cancel') return next
    if (policy === 'cancel') return 'cancel'
    if (policy === 'per-step' || policy === 'deny' || policy === 'none') return 'deny'
    return input.approve ? 'approve' : 'deny'
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
    },
    confirmedCommandOutcome: (_sessionId: string, command: string) => commandOutcome[command] ?? null
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
            const choice = takeDecision()
            confirms.push({
              requestId,
              command: ev.structured.action === 'command' ? (ev.structured.command ?? '') : '',
              decision: choice
            })
            if (choice === 'cancel') agent.cancelAiConfirmStep(requestId)
            else agent.resolveAiConfirmStep(requestId, choice === 'approve')
          } catch (error) {
            confirmError = error instanceof Error ? error : new Error(String(error))
            agent.resolveAiConfirmStep(requestId, false)
          }
        })
      }
    }
  }

  const previousPolls = process.env.AISS_MAX_POLLS
  const previousOmCap = process.env.AISS_OM_BULLET_CAP
  const previousOutputCap = process.env.AISS_OUTPUT_VIEW_CAP
  if (input.fixture.env?.AISS_MAX_POLLS) process.env.AISS_MAX_POLLS = input.fixture.env.AISS_MAX_POLLS
  if (input.fixture.env?.AISS_OM_BULLET_CAP) process.env.AISS_OM_BULLET_CAP = input.fixture.env.AISS_OM_BULLET_CAP
  else delete process.env.AISS_OM_BULLET_CAP
  if (input.fixture.env?.AISS_OUTPUT_VIEW_CAP) process.env.AISS_OUTPUT_VIEW_CAP = input.fixture.env.AISS_OUTPUT_VIEW_CAP
  else delete process.env.AISS_OUTPUT_VIEW_CAP
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
    if (previousOmCap == null) delete process.env.AISS_OM_BULLET_CAP
    else process.env.AISS_OM_BULLET_CAP = previousOmCap
    if (previousOutputCap == null) delete process.env.AISS_OUTPUT_VIEW_CAP
    else process.env.AISS_OUTPUT_VIEW_CAP = previousOutputCap
  }
  if (confirmError) throw confirmError
  const failed = events.find((event) => event.type === 'error')
  if (failed && failed.type === 'error') throw new Error(`${input.turn.turnId}: ${failed.message}`)
  return { events, prompts, requests, writes, served, confirms }
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

function assertOmBudget(label: string, events: AiStreamEvent[], spec: Expectation['omBudget']): void {
  if (!spec) return
  const rows = events.filter((event) => event.type === 'debug' && event.payload.entry.kind === 'context')
  assert.ok(rows.length > 0, `${label}: no context budget event`)
  for (const event of rows) {
    if (event.type !== 'debug' || event.payload.entry.kind !== 'context') continue
    const budget = event.payload.entry.omBudget
    const detail = JSON.stringify(budget)
    if (spec.truncated != null) assert.equal(budget.truncated, spec.truncated, `${label}: truncated ${detail}`)
    if (spec.nearBudget != null) assert.equal(budget.nearBudget, spec.nearBudget, `${label}: nearBudget ${detail}`)
    if (spec.summaryTruncated != null) {
      assert.equal(budget.summaryTruncated, spec.summaryTruncated, `${label}: summaryTruncated ${detail}`)
    }
    if (spec.minDroppedBullets != null) {
      assert.ok(budget.droppedBullets >= spec.minDroppedBullets, `${label}: droppedBullets ${detail}`)
    }
    if (spec.minTruncatedBullets != null) {
      assert.ok(budget.truncatedBullets >= spec.minTruncatedBullets, `${label}: truncatedBullets ${detail}`)
    }
    if (spec.bulletCap != null) assert.equal(budget.bulletCap, spec.bulletCap, `${label}: bulletCap ${detail}`)
  }
}

function assertExpectation(
  turn: Turn,
  result: DriveResult,
  autoApproveLowRisk: boolean,
  scope?: { hostId?: string; sessionId?: string; historyKey?: string }
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
    const budget = event.payload.entry.omBudget
    assert.equal(typeof budget.truncated, 'boolean', `${label}: om budget truncated is not observable`)
    assert.equal(typeof budget.nearBudget, 'boolean', `${label}: om budget nearBudget is not observable`)
    assert.equal(Number.isFinite(budget.bullets), true, `${label}: om budget bullets`)
    assert.equal(Number.isFinite(budget.bulletCap) && budget.bulletCap >= 2, true, `${label}: om budget cap`)
    assert.equal(Number.isFinite(budget.droppedBullets) && budget.droppedBullets >= 0, true, `${label}: om budget drops`)
    assert.equal(Number.isFinite(budget.truncatedBullets) && budget.truncatedBullets >= 0, true, `${label}: om budget cuts`)
    const view = event.payload.entry.outputView
    assert.equal(typeof view.truncated, 'boolean', `${label}: output view truncated is not observable`)
    assert.equal(Number.isFinite(view.originalChars) && view.originalChars >= 0, true, `${label}: output view length`)
    assert.equal(Number.isFinite(view.shownChars) && view.shownChars >= 0, true, `${label}: output view shown`)
    assert.equal(Number.isFinite(view.cap) && view.cap >= 240, true, `${label}: output view cap`)
    assert.ok(view.shownChars <= view.cap, `${label}: output view exceeds its cap`)
    assert.ok(Array.isArray(view.markers), `${label}: output view markers`)
    assert.equal(typeof view.citeWindow.stable, 'boolean', `${label}: cite window stable`)
    assert.ok(Array.isArray(view.citeWindow.outsideHeadTail), `${label}: cite window markers`)
    assert.ok(Array.isArray(view.citeWindow.droppedFiller), `${label}: cite window filler`)
    assert.equal(typeof view.citeHold.stable, 'boolean', `${label}: cite hold stable`)
    assert.ok(Array.isArray(view.citeHold.outsideHeadTail), `${label}: cite hold markers`)
    assert.ok(Array.isArray(view.citeHold.droppedFiller), `${label}: cite hold filler`)
    assert.equal(view.truncated, view.originalChars > view.cap, `${label}: output view truncated flag`)
    const retry = event.payload.entry.retryBudget
    assert.equal(Number.isFinite(retry.count) && retry.count >= 0, true, `${label}: retry budget count`)
    assert.equal(Number.isFinite(retry.cap) && retry.cap >= 1, true, `${label}: retry budget cap`)
    assert.equal(typeof retry.exhausted, 'boolean', true, `${label}: retry budget exhausted`)
    assert.equal(typeof retry.nearBudget, 'boolean', true, `${label}: retry budget nearBudget`)
    assert.equal(retry.exhausted, retry.count >= retry.cap, `${label}: retry budget exhausted does not match the count`)
  }
  assertOmBudget(label, context, expected.omBudget)
  assertCiteHold(label, context, result, expected.citeHold)
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
  if (expected.workingMemoryMustContain?.length || expected.workingMemoryMustNotContain?.length) {
    assert.ok(result.prompts.length > 0, `${label}: no planner prompt`)
    for (const prompt of result.prompts) {
      const block = workingMemorySection(prompt)
      assert.ok(block.includes('goal:'), `${label}: working-memory block missing`)
      for (const fact of expected.workingMemoryMustContain ?? []) {
        assert.ok(block.includes(fact), `${label}: working memory dropped ${fact}`)
      }
      for (const fact of expected.workingMemoryMustNotContain ?? []) {
        assert.equal(block.includes(fact), false, `${label}: working memory leaked ${fact}`)
      }
    }
    const persisted = scope?.historyKey ? loadPersistedCoreSession(scope.historyKey) : null
    const scratch = [
      persisted?.workingMemory?.goal ?? '',
      ...(persisted?.workingMemory?.constraints ?? []),
      ...(persisted?.workingMemory?.hostFacts ?? [])
    ].join('\n')
    for (const fact of expected.workingMemoryMustContain ?? []) {
      if (fact === 'hostFacts:') continue
      assert.ok(scratch.includes(fact), `${label}: persisted scratchpad dropped ${fact}`)
    }
    for (const fact of expected.workingMemoryMustNotContain ?? []) {
      assert.equal(scratch.includes(fact), false, `${label}: persisted scratchpad leaked ${fact}`)
    }
  }
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
  if (expected.observationalMemoryMustNotContain?.length) {
    assert.ok(result.requests.length > 0, `${label}: no planner request`)
    const persisted = scope?.historyKey ? loadPersistedCoreSession(scope.historyKey) : null
    const bullets = (persisted?.observationalMemory ?? []).map((bullet) => bullet.text).join('\n')
    for (const messages of result.requests) {
      const observed = observationalSection(systemText(messages))
      for (const fact of expected.observationalMemoryMustNotContain) {
        assert.equal(observed.includes(fact), false, `${label}: observational memory leaked ${fact}`)
      }
    }
    for (const fact of expected.observationalMemoryMustNotContain) {
      assert.equal(bullets.includes(fact), false, `${label}: persisted observational memory leaked ${fact}`)
    }
  }
  if (expected.recentCommandEvidenceMustContain?.length || expected.recentCommandEvidenceMustNotContain?.length) {
    assert.ok(result.prompts.length > 0, `${label}: no planner prompt`)
    for (const prompt of result.prompts) {
      const block = recentCommandEvidence(prompt)
      for (const fact of expected.recentCommandEvidenceMustContain ?? []) {
        assert.ok(block.includes(fact), `${label}: recent-command evidence missing ${fact}`)
      }
      for (const fact of expected.recentCommandEvidenceMustNotContain ?? []) {
        assert.equal(block.includes(fact), false, `${label}: recent-command evidence leaked ${fact}`)
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
        .map((line) => /decision=(approve|deny|cancel)/.exec(line)?.[1])
        .filter((item): item is 'approve' | 'deny' | 'cancel' => item === 'approve' || item === 'deny' || item === 'cancel')
      assert.deepEqual(decisions, expected.hitl.decisions, `${label}: HITL decisions ${decisions.join(',')}`)
    }
    if (expected.hitl.plannableAfterCancel) {
      const cancelLine = lines.find((line) => line.includes('decision=cancel'))
      assert.ok(cancelLine, `${label}: cancel did not record a decision`)
      assert.match(cancelLine ?? '', /phase=planning/, `${label}: cancel left a phase other than planning`)
      assert.match(cancelLine ?? '', /plannable=true/, `${label}: cancel was not plannable`)
      assert.equal((cancelLine ?? '').includes('decision=deny'), false, `${label}: cancel was recorded as deny`)
      assert.equal(agent.pendingAiConfirmCount(), 0, `${label}: confirm waiter stuck after cancel`)
    }
    if (expected.hitl.released) {
      assert.equal(agent.pendingAiConfirmCount(), 0, `${label}: confirm waiter stuck`)
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
  if (expected.freshPlan?.evidencePresent) {
    assert.ok(ended && ended.type === 'step', `${label}: replan did not end`)
    const description = ended && ended.type === 'step' ? ended.structured.description : ''
    assert.equal(description.includes('证据不足'), false, `${label}: 证据不足 although this turn has evidence`)
    const status = result.events
      .filter((event) => event.type === 'status')
      .map((event) => (event.type === 'status' ? event.text : ''))
      .join('\n')
    assert.equal(status.includes('证据不足'), false, `${label}: status claimed 证据不足`)
  }
  if (expected.recentCommandsMustContain || expected.recentCommandsMustNotContain) {
    const persisted = scope?.sessionId ? loadPersistedCoreSession(scope.sessionId) : null
    assert.ok(persisted, `${label}: session memory missing`)
    const recent = persisted?.recentCommands ?? []
    for (const command of expected.recentCommandsMustContain ?? []) {
      assert.ok(recent.some((item) => item.includes(command)), `${label}: recent commands missing ${command}`)
    }
    for (const command of expected.recentCommandsMustNotContain ?? []) {
      assert.equal(recent.some((item) => item.includes(command)), false, `${label}: recent commands contain ${command}`)
    }
  }
  assertHostState(turn, scope?.hostId)
  assertMidChainDeny(turn, result, scope)
  assertMidChainCancel(turn, result, scope)
  assertCommandFailure(turn, result)
  assertRetryBudget(turn, result)
  assertOutputView(turn, result)
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

/**
 * Cancel is not a deny and not an execution. The pure loop returns to planning
 * and can interrupt again. The cancelled command is absent from writes, from
 * recentCommands, and from the persisted session.
 */
function assertCancelReturnsToPlanning(): void {
  const planned = createHitlLoop()
  assert.equal(hitlIsPlannable(planned), true)
  const interrupted = interruptForProposal(planned, {
    action: 'command',
    command: "printf 'S23_HALF_APPLIED' >> /etc/s23/half.conf",
    riskLevel: 'high',
    requestId: 's23-sticky'
  })
  assert.equal(hitlIsPlannable(interrupted), false)
  assert.equal(sideEffectExecutionPermitted(interrupted), false)
  const denied = resumeHitl(interrupted, false)
  assert.equal(denied.phase, 'cancelled')
  assert.equal(denied.resume, 'deny')
  assert.equal(hitlIsPlannable(denied), false)
  assert.equal(cancelHitl(denied).phase, 'cancelled', 'cancel must not rewrite a deny')
  const cleared = cancelHitl(interrupted)
  assert.equal(hitlIsPlannable(cleared), true)
  assert.equal(sideEffectExecutionPermitted(markHitlExecuting(cleared)), false)
  assert.equal(resumeHitl(cleared, true).phase, 'planning')
  const replanned = interruptForProposal(cleared, {
    action: 'command',
    command: 'uptime',
    riskLevel: 'low',
    requestId: 's23-replan'
  })
  assert.equal(replanned.phase, 'interrupted')
  assert.equal(replanned.command, 'uptime')
  assert.notEqual(replanned.requestId, interrupted.requestId)
}

function persistedBlob(sessionId: string | undefined, historyKey: string | undefined): string {
  const session = sessionId ? loadPersistedCoreSession(sessionId) : null
  const thread = historyKey ? loadPersistedCoreSession(historyKey) : null
  return JSON.stringify({ session, thread })
}

function assertMidChainCancel(
  turn: Turn,
  result: DriveResult,
  scope?: { hostId?: string; sessionId?: string; historyKey?: string }
): void {
  const spec = turn.expected?.midChainCancel
  if (!spec) return
  assertCancelReturnsToPlanning()
  const label = turn.turnId
  const cancelled = spec.cancelledCommand
  assert.equal(
    result.writes.some((write) => write.includes(cancelled)),
    false,
    `${label}: cancelled command was written`
  )
  for (const write of result.writes) {
    const body = write.replace(/\s+$/g, '')
    const half = body.length > 0 && body !== cancelled && cancelled.startsWith(body)
    assert.equal(half, false, `${label}: half-written prefix of cancelled command: ${body}`)
  }
  for (const command of spec.laterCommands ?? []) {
    assert.equal(
      result.writes.some((write) => write.includes(command)),
      false,
      `${label}: later command written after cancel: ${command}`
    )
  }
  const resumeLines = hitlLines(result.events).filter((line) => line.includes('decision='))
  const decisions = resumeLines.map((line) => /decision=(approve|deny|cancel)/.exec(line)?.[1] ?? '')
  assert.ok(decisions.includes('cancel'), `${label}: missing cancel decision`)
  assert.equal(decisions.includes('deny'), false, `${label}: cancel was recorded as deny`)
  const cancelEvent = result.events.find((event) => event.type === 'cancelled')
  assert.ok(cancelEvent && cancelEvent.type === 'cancelled', `${label}: cancel did not emit cancelled`)
  const cancelMessage = cancelEvent && cancelEvent.type === 'cancelled' ? (cancelEvent.message ?? '') : ''
  assert.equal(cancelMessage.includes('未同意') || cancelMessage.includes('declined'), false, `${label}: cancel copy is the deny copy`)
  assert.ok(scope?.sessionId, `${label}: mid-chain cancel without a session id`)
  const persisted = scope?.sessionId ? loadPersistedCoreSession(scope.sessionId) : null
  assert.ok(persisted, `${label}: session memory missing after cancel`)
  const recent = persisted?.recentCommands ?? []
  assert.equal(
    recent.some((command) => command.includes(cancelled)),
    false,
    `${label}: cancelled command recorded as a successful run`
  )
  for (const command of spec.keptCommands ?? []) {
    assert.ok(result.writes.some((write) => write.includes(command)), `${label}: approved command missing from writes: ${command}`)
    assert.ok(recent.some((item) => item.includes(command)), `${label}: approved command missing from recent commands: ${command}`)
  }
  const ends = result.events.filter((event) => event.type === 'step' && event.structured.action === 'end')
  const endText = ends.map((event) => (event.type === 'step' ? event.structured.description : '')).join('\n')
  const surface = [
    result.writes.join('\n'),
    result.served.join('\n'),
    (persisted?.observations ?? []).join('\n'),
    (persisted?.notes ?? []).join('\n'),
    (persisted?.taskSummaries ?? []).join('\n'),
    recent.join('\n'),
    scope?.hostId ? hostBlob(scope.hostId) : '',
    endText,
    persistedBlob(scope?.sessionId, scope?.historyKey)
  ].join('\n')
  for (const marker of spec.leftoverMarkers) {
    assert.equal(surface.includes(marker), false, `${label}: leftover marker ${marker}`)
  }
}

/**
 * Nonzero, stderr, and timeout are failures. A clean exit is not, even when
 * the ring text says "failed". A retry of the failed command needs a new
 * request id. Deny stays cancelled; cancel returns to planning and can interrupt
 * again. Neither decision writes.
 */
function assertFailureModes(): void {
  const command = 'echo S27_FAIL_CMD'
  const nonzero = classifyCommandFailure(command, { exitCode: 1, stderr: '', timedOut: false, writeOk: true })
  assert.equal(nonzero?.kind, 'nonzero')
  assert.match(nonzero?.evidence ?? '', /exit=1/)
  const stderr = classifyCommandFailure(command, { exitCode: 0, stderr: 'S27_STDERR_EVIDENCE', timedOut: false, writeOk: true })
  assert.equal(stderr?.kind, 'stderr')
  assert.match(stderr?.evidence ?? '', /S27_STDERR_EVIDENCE/)
  const timeout = classifyCommandFailure(command, { exitCode: null, stderr: '', timedOut: true, timeoutMark: 'S27_TIMEOUT_STUB', writeOk: true })
  assert.equal(timeout?.kind, 'timeout')
  assert.match(timeout?.evidence ?? '', /S27_TIMEOUT_STUB/)
  const combined = classifyCommandFailure(command, {
    exitCode: 1,
    stderr: 'S27_STDERR_EVIDENCE',
    timedOut: true,
    timeoutMark: 'S27_TIMEOUT_STUB',
    writeOk: true
  })
  assert.equal(combined?.kind, 'timeout')
  assert.match(combined?.evidence ?? '', /exit=1/)
  assert.match(combined?.evidence ?? '', /S27_STDERR_EVIDENCE/)
  assert.match(combined?.evidence ?? '', /S27_TIMEOUT_STUB/)
  assert.equal(classifyCommandFailure('systemctl status nginx --no-pager', { exitCode: 0, stderr: '', timedOut: false, writeOk: true }), null)
  assert.equal(classifyCommandFailure('df -h', { writeOk: true }), null)
  const offer = '不会自动重跑。若要再执行，需要新的确认。'
  const explained = explainFailedCommand('这一步没有成功。', combined!, offer)
  assert.match(explained, /S27_STDERR_EVIDENCE/)
  assert.match(explained, /exit=1/)
  assert.match(explained, /S27_TIMEOUT_STUB/)
  assert.match(explained, /不会自动重跑/)
  assert.equal(explainFailedCommand(explained, combined!, offer), explained)
  assert.equal(
    retryWritePermitted({ command, failedCommand: command, requestId: 'a', priorRequestId: 'a', approved: true }),
    false
  )
  assert.equal(
    retryWritePermitted({ command, failedCommand: command, requestId: 'b', priorRequestId: 'a', approved: true }),
    true
  )
  assert.equal(
    retryWritePermitted({ command, failedCommand: command, requestId: 'b', priorRequestId: 'a', approved: false }),
    false
  )
  assert.equal(
    retryWritePermitted({ command, failedCommand: null, requestId: 'a', priorRequestId: null, approved: true }),
    true
  )
  assert.equal(RETRY_BUDGET_CAP, 2)
  assert.equal(observeRetryBudget(0).cap, 2)
  assert.equal(observeRetryBudget(0).exhausted, false)
  assert.equal(observeRetryBudget(0).nearBudget, false)
  const approaching = observeRetryBudget(1, command)
  assert.equal(approaching.nearBudget, true)
  assert.equal(approaching.exhausted, false)
  assert.equal(approaching.count, 1)
  const spent = observeRetryBudget(2, command)
  assert.equal(spent.exhausted, true)
  assert.equal(spent.nearBudget, true)
  assert.equal(spent.cap, 2)
  assert.equal(
    retryWritePermitted({ command, failedCommand: command, requestId: 'c', priorRequestId: 'b', approved: true, failureCount: 1 }),
    true
  )
  assert.equal(
    retryWritePermitted({ command, failedCommand: command, requestId: 'c', priorRequestId: 'b', approved: true, failureCount: 2 }),
    false
  )
  assert.equal(
    retryWritePermitted({ command, failedCommand: command, requestId: 'c', priorRequestId: 'b', approved: false, failureCount: 1 }),
    false
  )
  assert.equal(
    retryWritePermitted({
      command: 'echo OTHER',
      failedCommand: command,
      requestId: 'c',
      priorRequestId: 'b',
      approved: true,
      failureCount: 2
    }),
    true
  )
  const stopped = explainRetryBudgetStop(combined!, spent)
  assert.match(stopped, /重试预算已用尽/)
  assert.match(stopped, /证据不足/)
  assert.match(stopped, /需要人工/)
  assert.match(stopped, /不会自动重跑/)
  assert.match(stopped, /不再等待新的确认/)
  assert.match(stopped, /S27_STDERR_EVIDENCE/)
  assert.match(stopped, /exit=1/)
  assert.match(stopped, /S27_TIMEOUT_STUB/)
  assert.match(stopped, /count=2/)
  assert.match(stopped, /cap=2/)
  assert.equal(explainRetryBudgetStop(combined!, spent), stopped)
  const denied = resumeHitl(
    interruptForProposal(createHitlLoop(), { action: 'command', command, riskLevel: 'low', requestId: 's27-deny' }),
    false
  )
  assert.equal(denied.phase, 'cancelled')
  assert.equal(denied.resume, 'deny')
  assert.equal(hitlIsPlannable(denied), false)
  assert.equal(cancelHitl(denied).phase, 'cancelled', 'cancel must not rewrite a deny')
  const cleared = cancelHitl(
    interruptForProposal(createHitlLoop(), { action: 'command', command, riskLevel: 'low', requestId: 's27-cancel' })
  )
  assert.equal(hitlIsPlannable(cleared), true)
  assert.equal(sideEffectExecutionPermitted(cleared), false)
  const again = interruptForProposal(cleared, { action: 'command', command: 'uptime', riskLevel: 'low', requestId: 's27-next' })
  assert.equal(again.phase, 'interrupted')
  assert.notEqual(again.requestId, 's27-cancel')
}

function assertCommandFailure(turn: Turn, result: DriveResult): void {
  const spec = turn.expected?.commandFailure
  if (!spec) return
  assertFailureModes()
  const label = turn.turnId
  const writesOf = result.writes.map((write) => write.replace(/\s+$/g, '')).filter((write) => write === spec.command)
  assert.equal(writesOf.length, spec.writeCount, `${label}: writes of ${spec.command}`)
  const steps = result.events.filter((event) => event.type === 'step' && event.structured.command === spec.command)
  const ids = steps.map((event) => (event.type === 'step' ? event.requestId ?? '' : ''))
  assert.ok(ids.length >= spec.minDistinctRequestIds, `${label}: ${ids.length} confirm cards`)
  assert.equal(new Set(ids).size, ids.length, `${label}: confirm requestId reused`)
  for (const event of steps) {
    assert.equal(event.type === 'step' && Boolean(event.requestId), true, `${label}: retry card missing requestId`)
    assert.notEqual(event.type === 'step' ? event.autoApproved : true, true, `${label}: retry was auto-approved`)
  }
  const approved = result.confirms.filter((confirm) => confirm.decision === 'approve' && confirm.command === spec.command)
  assert.equal(new Set(approved.map((confirm) => confirm.requestId)).size, approved.length, `${label}: duplicate approval`)
  assert.equal(approved.length, spec.writeCount, `${label}: write without a matching approval`)
  assert.ok(result.prompts.length >= 2, `${label}: failure was not shown to a later planner step`)
  const afterFailure = result.prompts.slice(1)
  for (const prompt of afterFailure) {
    assert.ok(prompt.includes('禁止自动重跑'), `${label}: post-failure prompt does not forbid auto-retry`)
  }
  for (const fact of spec.evidence) {
    assert.ok(
      afterFailure.every((prompt) => prompt.includes(fact)),
      `${label}: post-failure prompt missing ${fact}`
    )
  }
  const debug = result.events
    .filter((event) => event.type === 'debug' && event.payload.entry.kind === 'execution')
    .map((event) => (event.type === 'debug' ? `${event.payload.entry.label}\n${event.payload.entry.detail ?? ''}` : ''))
    .filter((line) => line.includes('autoRetry=false'))
  assert.ok(debug.length >= 1, `${label}: failure was not recorded`)
  const recorded = debug.join('\n')
  assert.match(recorded, /failed=true/)
  for (const fact of spec.evidence) assert.ok(recorded.includes(fact), `${label}: failure record missing ${fact}`)
  if (!spec.endCitesEvidence) return
  const ended = [...result.events].reverse().find((event) => event.type === 'step' && event.structured.action === 'end')
  assert.ok(ended && ended.type === 'step', `${label}: failure was not explained`)
  if (!ended || ended.type !== 'step') return
  for (const fact of spec.evidence) {
    assert.ok(ended.structured.description.includes(fact), `${label}: explanation missing ${fact}`)
  }
  assert.match(ended.structured.description, /不会自动重跑/)
  assert.match(ended.structured.description, /新的确认/)
}

function assertRetryBudget(turn: Turn, result: DriveResult): void {
  const spec = turn.expected?.retryBudget
  if (!spec) return
  const label = turn.turnId
  const rows = result.events.filter((event) => event.type === 'debug' && event.payload.entry.kind === 'context')
  assert.ok(rows.length > 0, `${label}: retry budget has no context event`)
  const last = rows[rows.length - 1]
  assert.ok(last && last.type === 'debug' && last.payload.entry.kind === 'context', `${label}: retry budget context event`)
  if (!last || last.type !== 'debug' || last.payload.entry.kind !== 'context') return
  const budget = last.payload.entry.retryBudget
  const detail = JSON.stringify(budget)
  assert.equal(budget.count, spec.count, `${label}: retry count ${detail}`)
  assert.equal(budget.cap, spec.cap, `${label}: retry cap ${detail}`)
  assert.equal(budget.exhausted, spec.exhausted, `${label}: retry exhausted ${detail}`)
  assert.equal(budget.nearBudget, spec.nearBudget, `${label}: retry nearBudget ${detail}`)
  if (spec.sawApproach) {
    const approached = rows.some((event) => {
      if (event.type !== 'debug' || event.payload.entry.kind !== 'context') return false
      const prior = event.payload.entry.retryBudget
      return prior.count === spec.count - 1 && prior.exhausted === false && prior.nearBudget === true
    })
    assert.equal(approached, true, `${label}: no in-budget retry signal before the cap`)
  }
  const command = turn.expected?.commandFailure?.command
  if (spec.confirmCards != null) {
    assert.ok(command, `${label}: confirmCards without a command`)
    const cards = result.events.filter((event) => event.type === 'step' && event.structured.command === command)
    assert.equal(cards.length, spec.confirmCards, `${label}: confirm cards ${cards.length}`)
    const ids = cards.map((event) => (event.type === 'step' ? event.requestId ?? '' : ''))
    assert.equal(new Set(ids).size, ids.length, `${label}: retry requestId reused`)
    for (const id of ids) assert.ok(id, `${label}: retry card missing requestId`)
  }
  const blocked = result.events.some(
    (event) => event.type === 'debug' && event.payload.entry.kind === 'execution' && (event.payload.entry.detail ?? '').includes('blockedWrite=true')
  )
  assert.equal(blocked, spec.blockedWrite === true, `${label}: blockedWrite ${blocked}`)
  if (spec.blockedWrite !== true) return
  const ended = [...result.events].reverse().find((event) => event.type === 'step' && event.structured.action === 'end')
  assert.ok(ended && ended.type === 'step', `${label}: over-budget turn did not end`)
  if (!ended || ended.type !== 'step') return
  assert.match(ended.structured.description, /重试预算已用尽/)
  assert.match(ended.structured.description, /证据不足/)
  assert.match(ended.structured.description, /需要人工/)
  assert.match(ended.structured.description, /不会自动重跑/)
  assert.match(ended.structured.description, /count=2/)
  assert.match(ended.structured.description, /cap=2/)
  if (command) {
    const writes = result.writes.map((write) => write.replace(/\s+$/g, '')).filter((write) => write === command)
    assert.equal(writes.length, turn.expected?.commandFailure?.writeCount ?? writes.length, `${label}: over-budget write`)
  }
}

/**
 * A long stdout, stderr, or ring is truncated. A rare marker in the dropped
 * middle stays in the planner view and can be cited. A rare token that was
 * never in the output is not cited. The cap cannot be raised from the env.
 */
function assertCiteHold(
  label: string,
  context: AiStreamEvent[],
  result: DriveResult,
  spec: Expectation['citeHold']
): void {
  if (!spec) return
  const last = context[context.length - 1]
  assert.ok(last && last.type === 'debug' && last.payload.entry.kind === 'context', `${label}: cite hold has no context event`)
  if (!last || last.type !== 'debug' || last.payload.entry.kind !== 'context') return
  const hold = last.payload.entry.outputView.citeHold
  const detail = JSON.stringify(hold)
  if (spec.stable != null) assert.equal(hold.stable, spec.stable, `${label}: cite hold stable ${detail}`)
  if (spec.head != null) assert.equal(hold.head, spec.head, `${label}: cite hold head ${detail}`)
  if (spec.outsideHeadTail?.length === 0) {
    assert.deepEqual(hold.outsideHeadTail, [], `${label}: cite hold inherited markers ${detail}`)
  }
  for (const marker of spec.outsideHeadTail ?? []) {
    assert.ok(hold.outsideHeadTail.includes(marker), `${label}: cite hold dropped ${marker} ${detail}`)
  }
  if (spec.droppedFiller?.length === 0) {
    assert.deepEqual(hold.droppedFiller, [], `${label}: cite hold inherited filler ${detail}`)
  }
  for (const filler of spec.droppedFiller ?? []) {
    assert.ok(hold.droppedFiller.includes(filler), `${label}: cite hold lost dropped filler ${filler} ${detail}`)
  }
  const prompt = result.prompts[result.prompts.length - 1] ?? ''
  const observed = observationalSection(prompt)
  for (const marker of spec.outsideHeadTail ?? []) {
    assert.ok(observed.includes(marker), `${label}: observational memory dropped scarce marker ${marker}`)
  }
  for (const filler of spec.droppedFiller ?? []) {
    assert.equal(observed.includes(filler), false, `${label}: observational memory cited dropped filler ${filler}`)
    assert.equal(prompt.includes(filler), false, `${label}: planner prompt cited dropped filler ${filler}`)
  }
}

/**
 * A long stdout, stderr, or ring is truncated. A rare marker in the dropped
 * middle stays in the planner view and can be cited. A rare token that was
 * never in the output is not cited. The same marker stays citeable after a
 * naive observational head cut, and dropped filler does not come back.
 * The cap cannot be raised from the env.
 */
function assertCiteableTruncateModes(): void {
  assert.equal(tipSuggest, '0.4.8-polish6')
  assert.equal(rollback, '0.4.8-polish5')
  assert.equal(OUTPUT_VIEW_CAP, 6000)
  const short = truncateCiteableOutput('short ring')
  assert.equal(short.truncated, false)
  assert.equal(short.text, 'short ring')
  assert.equal(short.shownChars, short.originalChars)
  assert.equal(explainCiteableOutput('plain end', short), 'plain end')

  const head = `s29-head-kept\n${'h\n'.repeat(400)}`
  const middle = `s29-dropped-filler-token\n${'m\n'.repeat(2500)}S29_RARE_MARKER\n${'m\n'.repeat(500)}`
  const tail = `${'t\n'.repeat(300)}s29-tail-kept\n`
  const raw = `${head}${middle}${tail}`
  assert.ok(raw.length > OUTPUT_VIEW_CAP)
  const markerAt = raw.indexOf('S29_RARE_MARKER')
  assert.ok(markerAt > 800, 'unit marker is outside the head window')
  assert.ok(markerAt < raw.length - 800, 'unit marker is outside the tail window')
  const view = truncateCiteableOutput(raw)
  assert.equal(view.truncated, true)
  assert.equal(view.cap, OUTPUT_VIEW_CAP)
  assert.equal(view.tipSuggest, '0.4.8-polish6')
  assert.equal(view.rollback, '0.4.8-polish5')
  assert.ok(view.originalChars > view.cap)
  assert.ok(view.shownChars <= view.cap)
  assert.ok(view.shownChars < view.originalChars)
  assert.ok(view.text.includes('S29_RARE_MARKER'))
  assert.ok(view.text.includes('s29-head-kept'))
  assert.ok(view.text.includes('s29-tail-kept'))
  assert.equal(view.text.includes('s29-dropped-filler-token'), false)
  assert.ok(view.markers.includes('S29_RARE_MARKER'))
  assert.equal(view.citeWindow.stable, true)
  assert.ok(view.citeWindow.outsideHeadTail.includes('S29_RARE_MARKER'))
  assert.ok(view.citeWindow.droppedFiller.includes('s29-dropped-filler-token'))
  const explained = explainCiteableOutput('命令已经执行。我还看到 S29_ABSENT_LINE 和 s29-dropped-filler-token。', view)
  assert.match(explained, /S29_RARE_MARKER/)
  assert.equal(explained.includes('S29_ABSENT_LINE'), false)
  assert.equal(explained.includes('s29-dropped-filler-token'), false)
  assert.equal(explainCiteableOutput(explained, view), explained)
  const naive = `${'甲'.repeat(180)}\nS29_RARE_MARKER 以及 s29-dropped-filler-token`
  const naiveHead = naive.replace(/\s+/g, ' ').slice(0, 140)
  assert.equal(naiveHead.includes('S29_RARE_MARKER'), false, 'naive observational head drops the scarce marker')
  assert.ok(naiveHead.includes('s29-dropped-filler-token') === false || naive.indexOf('s29-dropped-filler-token') > 140)
  const longEnd = `看到 s29-dropped-filler-token。${'甲'.repeat(180)}\nS29_RARE_MARKER`
  const longHead = longEnd.replace(/\s+/g, ' ').slice(0, 140)
  assert.ok(longHead.includes('s29-dropped-filler-token'), 'naive head keeps filler that the cite line must drop')
  assert.equal(longHead.includes('S29_RARE_MARKER'), false)
  const keptLine = citeObservationLine(longEnd, 140)
  assert.ok(keptLine, 'cite line keeps a marker past the observational head')
  assert.match(keptLine?.text ?? '', /S29_RARE_MARKER/)
  assert.equal((keptLine?.text ?? '').includes('s29-dropped-filler-token'), false)
  const compressed = citeObservationLine(raw, 140)
  assert.ok(compressed, 'a truncated ring compresses to a cite line')
  assert.match(compressed?.text ?? '', /S29_RARE_MARKER/)
  assert.equal((compressed?.text ?? '').includes('s29-dropped-filler-token'), false)
  assert.ok(compressed?.cite.droppedFiller.includes('s29-dropped-filler-token'))
  const previousOm = process.env.AISS_OM_BULLET_CAP
  try {
    process.env.AISS_OM_BULLET_CAP = '4'
    const turns: TranscriptTurn[] = [
      { role: 'user', content: raw },
      { role: 'assistant', content: longEnd }
    ]
    for (let i = 1; i <= 16; i++) {
      turns.push({ role: 'user', content: `继续无关项 ${i}。` })
      turns.push({ role: 'assistant', content: `无关项 ${i} 结束。` })
    }
    const folded = compactTranscript(turns, EMPTY_THREAD, 8)
    assert.equal(folded.omBudget.truncated, true)
    assert.equal(folded.omBudget.nearBudget, true)
    assert.ok(folded.omBudget.droppedBullets >= 1)
    assert.equal(folded.ctx.citeHold?.stable, true)
    assert.ok(folded.ctx.citeHold?.outsideHeadTail.includes('S29_RARE_MARKER'))
    assert.ok(folded.ctx.citeHold?.droppedFiller.includes('s29-dropped-filler-token'))
    const bullets = folded.ctx.observationalMemory.map((bullet) => bullet.text).join('\n')
    assert.match(bullets, /S29_RARE_MARKER/)
    assert.equal(bullets.includes('s29-dropped-filler-token'), false)
    assert.equal(folded.ctx.runningSummary.includes('s29-dropped-filler-token'), false)

    const markerBullet = folded.ctx.observationalMemory.find((bullet) => bullet.text.includes('S29_RARE_MARKER'))
    assert.ok(markerBullet, 'first compression kept a bullet for the scarce marker')
    const pad = (id: string, at: number): ObservationBullet => ({ id, text: `user: ${id}`, createdAt: at })
    const crowded: ObservationBullet[] = [
      pad('S29_EARLY_TOKEN', 1),
      pad('S29_EARLY_TOKENB', 2),
      { ...markerBullet, createdAt: 3 },
      pad('S29_LATE_TOKENA', 4),
      pad('S29_LATE_TOKENB', 5),
      pad('S29_LATE_TOKENC', 6)
    ]
    const again: TranscriptTurn[] = [
      ...turns,
      { role: 'user', content: '继续把 s29-dropped-filler-token 再写进摘要。' },
      { role: 'assistant', content: '第二次压缩不应引用已经丢掉的填充。' }
    ]
    for (let i = 0; i < 10; i++) {
      again.push({ role: 'user', content: `继续第二轮 ${i}。` })
      again.push({ role: 'assistant', content: `第二轮 ${i} 结束。` })
    }
    const recompressed = compactTranscript(again, { ...folded.ctx, observationalMemory: crowded }, 8)
    assert.equal(recompressed.omBudget.truncated, true)
    assert.equal(recompressed.ctx.citeHold?.stable, true)
    assert.ok(recompressed.ctx.citeHold?.outsideHeadTail.includes('S29_RARE_MARKER'))
    assert.ok(recompressed.ctx.citeHold?.droppedFiller.includes('s29-dropped-filler-token'))
    const recompressedBullets = recompressed.ctx.observationalMemory.map((bullet) => bullet.text).join('\n')
    assert.match(recompressedBullets, /S29_RARE_MARKER/)
    assert.equal(recompressedBullets.includes('s29-dropped-filler-token'), false)
    assert.equal(recompressed.ctx.runningSummary.includes('s29-dropped-filler-token'), false)
    assert.ok(
      recompressed.ctx.episodes.every((episode) => !episode.text.includes('s29-dropped-filler-token')),
      're-compression episode cited dropped filler'
    )
    const held = recompressed.ctx.citeHold
    const draft = citeHeldPatchDraft(
      '这是补丁草案，同意前不会写入。我还看到 s29-dropped-filler-token，还有 S29_ABSENT_LINE。',
      held
    )
    assert.match(draft, /S29_RARE_MARKER/)
    assert.match(draft, /补丁草案/)
    assert.equal(draft.includes('s29-dropped-filler-token'), false)
    assert.equal(draft.includes('S29_ABSENT_LINE'), false)
    assert.equal(citeHeldPatchDraft(draft, held), draft)
    assert.equal(citeHeldPatchDraft('噪声结束。', held), '噪声结束。')
    const patchBefore = 'export function answer() {\n  return 1\n}\n// s29-dropped-filler-token\n'
    const patchTree = createMockTree({
      'tests/fixtures/core-a/mock-s29-unit.ts': patchBefore
    })
    const patchNpm = [
      'not ok 1 - cite hold patch',
      '  ---',
      "  error: 'Expected values to be strictly equal: s29-dropped-filler-token S29_ABSENT_LINE'",
      "  expected: 'return 3'",
      "  actual: 'return 1'",
      "  file: 'tests/fixtures/core-a/mock-s29-unit.ts'",
      '  ...',
      '# fail 1'
    ].join('\n')
    const reviewed = reviewNpmTestFailure(patchNpm, patchTree, held)
    assert.ok(reviewed, 'patch draft under cite hold')
    assert.equal(patchTree.writeCount(), 0)
    assert.match(reviewed?.draft.explanation ?? '', /S29_RARE_MARKER/)
    assert.equal((reviewed?.draft.explanation ?? '').includes('s29-dropped-filler-token'), false)
    assert.equal((reviewed?.draft.explanation ?? '').includes('S29_ABSENT_LINE'), false)
    const patchCard = patchDraftConfirmCard(reviewed!)
    assert.equal(patchCard.autoApproved, false)
    assert.ok(patchCard.requestId)
    assert.equal(patchCard.riskLevel, 'high')
    assert.match(patchCard.description, /S29_RARE_MARKER/)
    assert.equal(sideEffectExecutionPermitted(reviewed!.hitl), false)
    assert.equal(patchWritePermitted(reviewed!.hitl), false)
    const patchDenied = decidePatch(reviewed!, false, patchTree)
    assert.equal(patchDenied.applied, false)
    assert.equal(patchTree.writeCount(), 0)
    assert.equal(patchTree.snapshot()['tests/fixtures/core-a/mock-s29-unit.ts'], patchBefore)
    const citedWrite = citeHeldAppliedWrite(patchBefore.replace('return 1', 'return 3'), held)
    assert.match(citedWrite, /S29_RARE_MARKER/)
    assert.match(citedWrite, /return 3/)
    assert.equal(citedWrite.includes('s29-dropped-filler-token'), false)
    assert.equal(citeHeldAppliedWrite(citedWrite, held), citedWrite)
    assert.equal(citeHeldAppliedWrite('export const value = 3\n', null), 'export const value = 3\n')
    assert.equal(held?.stable, true)
    const agreeTree = createMockTree({
      'tests/fixtures/core-a/mock-s29-unit.ts': patchBefore
    })
    const patchAgreed = decidePatch(reviewed!, true, agreeTree)
    assert.equal(patchAgreed.applied, true)
    assert.equal(sideEffectExecutionPermitted(patchAgreed.state), false)
    assert.equal(patchWritePermitted(patchAgreed.state), true)
    const agreedBody = agreeTree.snapshot()['tests/fixtures/core-a/mock-s29-unit.ts'] ?? ''
    assert.match(agreedBody, /S29_RARE_MARKER/)
    assert.match(agreedBody, /return 3/)
    assert.equal(agreedBody.includes('s29-dropped-filler-token'), false)
    assert.equal(agreedBody.includes('S29_ABSENT_LINE'), false)
    const noIdTree = createMockTree({
      'tests/fixtures/core-a/mock-s29-unit.ts': patchBefore
    })
    const noId = applyPatchDraft({ ...patchAgreed.state, requestId: null }, reviewed!.draft, noIdTree)
    assert.equal(noId.applied, false)
    assert.equal(noIdTree.writeCount(), 0)
    assert.equal(noIdTree.snapshot()['tests/fixtures/core-a/mock-s29-unit.ts'], patchBefore)
    const blankId = applyPatchDraft({ ...patchAgreed.state, requestId: '   ' }, reviewed!.draft, noIdTree)
    assert.equal(blankId.applied, false)
    assert.equal(noIdTree.writeCount(), 0)
  } finally {
    if (previousOm == null) delete process.env.AISS_OM_BULLET_CAP
    else process.env.AISS_OM_BULLET_CAP = previousOm
  }

  const previous = process.env.AISS_OUTPUT_VIEW_CAP
  try {
    process.env.AISS_OUTPUT_VIEW_CAP = '8000'
    assert.equal(outputViewCap(), OUTPUT_VIEW_CAP)
    process.env.AISS_OUTPUT_VIEW_CAP = '1000'
    const lowered = truncateCiteableOutput(raw)
    assert.equal(lowered.cap, 1000)
    assert.equal(lowered.truncated, true)
    assert.ok(lowered.shownChars <= 1000)
    assert.ok(lowered.text.includes('S29_RARE_MARKER'))
    assert.equal(lowered.text.includes('s29-dropped-filler-token'), false)
  } finally {
    if (previous == null) delete process.env.AISS_OUTPUT_VIEW_CAP
    else process.env.AISS_OUTPUT_VIEW_CAP = previous
  }
}

function assertOutputView(turn: Turn, result: DriveResult): void {
  const spec = turn.expected?.outputView
  if (!spec) return
  assertCiteableTruncateModes()
  const label = turn.turnId
  const rows = result.events.filter((event) => event.type === 'debug' && event.payload.entry.kind === 'context')
  const last = rows[rows.length - 1]
  assert.ok(last && last.type === 'debug' && last.payload.entry.kind === 'context', `${label}: output view has no context event`)
  if (!last || last.type !== 'debug' || last.payload.entry.kind !== 'context') return
  const view = last.payload.entry.outputView
  const detail = JSON.stringify({
    truncated: view.truncated,
    originalChars: view.originalChars,
    shownChars: view.shownChars,
    cap: view.cap,
    markers: view.markers
  })
  assert.equal(view.truncated, spec.truncated, `${label}: output truncated ${detail}`)
  if (spec.cap != null) assert.equal(view.cap, spec.cap, `${label}: output cap ${detail}`)
  if (spec.minOriginalChars != null) {
    assert.ok(view.originalChars >= spec.minOriginalChars, `${label}: originalChars ${detail}`)
  }
  assert.ok(view.shownChars <= view.cap, `${label}: shownChars over cap ${detail}`)
  assert.ok(view.originalChars > view.shownChars, `${label}: truncation did not shorten the view ${detail}`)
  for (const marker of spec.markers ?? []) {
    assert.ok(view.markers.includes(marker), `${label}: output view dropped marker ${marker}`)
  }
  if (spec.tipSuggest != null) assert.equal(view.tipSuggest, spec.tipSuggest, `${label}: tipSuggest`)
  if (spec.rollback != null) assert.equal(view.rollback, spec.rollback, `${label}: rollback`)
  if (spec.citeWindow?.stable != null) {
    assert.equal(view.citeWindow.stable, spec.citeWindow.stable, `${label}: cite window stable`)
  }
  for (const marker of spec.citeWindow?.outsideHeadTail ?? []) {
    assert.ok(view.citeWindow.outsideHeadTail.includes(marker), `${label}: cite window dropped ${marker}`)
  }
  for (const filler of spec.citeWindow?.droppedFiller ?? []) {
    assert.ok(view.citeWindow.droppedFiller.includes(filler), `${label}: cite window lost filler ${filler}`)
  }
  const prompt = result.prompts[result.prompts.length - 1] ?? ''
  for (const fact of spec.keptInPrompt ?? []) {
    assert.ok(prompt.includes(fact), `${label}: truncated prompt dropped ${fact}`)
  }
  for (const fact of spec.droppedFromPrompt ?? []) {
    assert.equal(prompt.includes(fact), false, `${label}: truncated prompt kept dropped filler ${fact}`)
  }
  const raw = result.served.join('\n')
  for (const fact of spec.presentInRaw ?? []) {
    assert.ok(raw.includes(fact), `${label}: raw ring missing ${fact}`)
  }
  for (const fact of spec.droppedFromPrompt ?? []) {
    assert.ok(raw.includes(fact), `${label}: dropped filler was not in the raw ring ${fact}`)
  }
}

function branchTurn(fixture: Fixture, branch: BranchTurn): Turn {
  const sample = (fixture.turns ?? [])[0]
  return {
    turnId: branch.turnId,
    userMessage: branch.userMessage || sample?.userMessage || '',
    mockTerminal: branch.mockTerminal || sample?.mockTerminal,
    userConfirm: branch.userConfirm ?? sample?.userConfirm,
    mockedPlannerSteps: branch.mockedPlannerSteps || sample?.mockedPlannerSteps,
    expected: branch.expected
  }
}

function branchFixture(fixture: Fixture, branch: BranchTurn, fallback: string): Fixture {
  return {
    ...fixture,
    hostProfile: branch.hostProfile ?? fixture.hostProfile,
    session: branch.session ?? {
      targetSessionId: `${fixture.session.targetSessionId}-${fallback}`,
      historyKey: fixture.session.historyKey
    },
    seedInventory: branch.seedInventory ?? fixture.seedInventory,
    negativeCase: undefined,
    regressionCase: undefined,
    cancelCase: undefined,
    overBudgetCase: undefined
  }
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
        approve: turn.userConfirm?.policy !== 'deny' && turn.userConfirm?.policy !== 'cancel'
      })
      assertExpectation(turn, result, false, {
        hostId: fixture.seedInventory?.hostId || fixture.hostProfile?.hostId,
        sessionId: fixture.session.targetSessionId,
        historyKey: fixture.session.historyKey
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

function projectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function snapshotCoreADocs(root: string): Record<string, string> {
  const dir = join(root, 'tests/fixtures/core-a')
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json') && !name.endsWith('.md')) continue
    out[name] = readFileSync(join(dir, name), 'utf8')
  }
  return out
}

function materializeMock(files: Record<string, string>): { root: string; files: Record<string, string> } {
  const root = mkdtempSync(join(tmpdir(), 'core-a-s22-disk-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  return { root, files: { ...files } }
}

function readMaterialized(disk: { root: string; files: Record<string, string> }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of Object.keys(disk.files)) out[rel] = readFileSync(join(disk.root, rel), 'utf8')
  return out
}

/**
 * S15: a failing npm/eval gate explains itself, then the patch stays a proposal.
 * Agree writes the harness mock. Decline leaves that tree unchanged.
 * S22: the same loop on a red unit test. The explanation is human, not the
 * stack wall. The factory does not auto-apply. Deny leaves no patch on disk.
 * A half-written hunk is not success.
 */
function assertTfl(fixture: Fixture, hold?: CiteWindow | null): void {
  const spec = fixture.tfl
  assert.ok(spec, `${fixture.id}: missing tfl spec`)
  const label = fixture.id
  const started = { ...spec.mockTree }
  const repo = spec.confirmBeforeApply ? projectRoot() : ''
  const docsBefore = spec.confirmBeforeApply ? snapshotCoreADocs(repo) : null
  const disk = spec.confirmBeforeApply ? materializeMock(spec.mockTree) : null
  if (spec.confirmBeforeApply) {
    for (const rel of Object.keys(spec.mockTree)) {
      assert.equal(existsSync(join(repo, rel)), false, `${label}: mock path already on disk: ${rel}`)
    }
  }
  const reviewedOn = createMockTree(spec.mockTree)
  const review = reviewNpmTestFailure(spec.npmOutput, reviewedOn, hold)
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
  for (const fact of spec.agreeMustNotContain ?? []) {
    assert.equal(body.includes(fact), false, `${label}: agreed file cited ${fact}`)
  }
  if (hold && (hold.outsideHeadTail.length > 0 || hold.droppedFiller.length > 0)) {
    assert.equal(hold.stable, true, `${label}: agree saw an unstable citeHold`)
    for (const marker of hold.outsideHeadTail) {
      assert.ok(body.includes(marker), `${label}: agreed write dropped held marker ${marker}`)
    }
    for (const filler of hold.droppedFiller) {
      assert.equal(body.includes(filler), false, `${label}: agreed write cited dropped filler ${filler}`)
    }
  }
  const noIdTree = createMockTree(spec.mockTree)
  const approved = markHitlExecuting(resumeHitl(review.hitl, true))
  const noId = applyPatchDraft({ ...approved, requestId: null }, review.draft, noIdTree)
  assert.equal(noId.applied, false, `${label}: agree without requestId wrote`)
  assert.equal(noIdTree.writeCount(), 0, `${label}: missing requestId wrote`)
  assert.deepEqual(noIdTree.snapshot(), started, `${label}: missing requestId changed the tree`)
  const blankId = applyPatchDraft({ ...approved, requestId: '   ' }, review.draft, noIdTree)
  assert.equal(blankId.applied, false, `${label}: blank requestId wrote`)
  assert.equal(noIdTree.writeCount(), 0, `${label}: blank requestId wrote`)
  assert.deepEqual(declineTree.snapshot(), started, `${label}: agree mutated the declined tree`)

  if (!spec.confirmBeforeApply || !docsBefore || !disk) return
  assert.ok(spec.npmOutput.includes('node:internal'), `${label}: red unit test has no stack wall`)
  assert.ok(
    review.draft.explanation.length < spec.npmOutput.length,
    `${label}: explanation is not shorter than the raw report`
  )
  assert.notEqual(review.draft.explanation.trim(), spec.npmOutput.trim(), `${label}: explanation is the raw report`)
  assert.ok(review.draft.explanation.split('\n').length <= 4, `${label}: explanation is a stack wall`)
  assert.equal(/^\s*at \S+/m.test(review.draft.explanation), false, `${label}: explanation is a stack frame`)
  assert.equal(card.description, review.draft.explanation, `${label}: confirm card is not the human explanation`)
  assert.equal(card.command.includes('node:internal'), false, `${label}: confirm card shows the stack wall`)
  assert.ok(card.notes.includes('Decline'), `${label}: confirm card has no decline`)
  assert.equal(review.hitl.phase, 'interrupted', `${label}: factory left the draft past confirm`)
  assert.equal(reviewedOn.writeCount(), 0, `${label}: factory auto-applied the draft`)
  assert.equal(sideEffectExecutionPermitted(review.hitl), false, `${label}: factory opened SSH`)

  const first = review.draft.hunks[0]
  assert.ok(first, `${label}: confirm draft has no hunk`)
  assert.equal(agreeTree.snapshot()[first.path], first.after, `${label}: agree wrote a partial patch`)
  for (const [rel, original] of Object.entries(started)) {
    if (agreed.written.includes(rel)) continue
    assert.equal(agreeTree.snapshot()[rel], original, `${label}: agree wrote an untouched file`)
  }

  const prefix = first.after.slice(0, Math.max(1, Math.floor(first.after.length / 2)))
  assert.notEqual(prefix, first.before, `${label}: half fixture matches the original file`)
  assert.notEqual(prefix, first.after, `${label}: half fixture is the full patch`)
  const executing = markHitlExecuting(resumeHitl(review.hitl, true))
  assert.equal(executing.phase, 'executing', `${label}: agree did not reach executing`)
  const halfTree = createMockTree({ ...started, [first.path]: prefix })
  const half = applyPatchDraft(executing, review.draft, halfTree)
  assert.equal(half.applied, false, `${label}: half-written change treated as success`)
  assert.deepEqual(half.written, [])
  assert.equal(halfTree.snapshot()[first.path], prefix, `${label}: half-written file was completed`)
  for (const [rel, original] of Object.entries(started)) {
    if (rel === first.path) continue
    assert.equal(halfTree.snapshot()[rel], original, `${label}: half apply touched ${rel}`)
  }

  const poisoned = applyPatchDraft(executing, {
    ...review.draft,
    hunks: [...review.draft.hunks, { path: `${first.path}.half`, before: 'S22_HALF_BEFORE', after: 'S22_HALF_APPLIED\n' }]
  }, createMockTree(started))
  assert.equal(poisoned.applied, false, `${label}: partial hunk chain treated as success`)
  assert.deepEqual(poisoned.written, [])
  assert.deepEqual(poisoned.tree.snapshot(), started, `${label}: partial hunk chain left a half write`)

  assert.deepEqual(readMaterialized(disk), disk.files, `${label}: deny left a patch on disk`)
  for (const rel of Object.keys(spec.mockTree)) {
    assert.equal(existsSync(join(repo, rel)), false, `${label}: patch written on disk at ${rel}`)
  }
  assert.deepEqual(snapshotCoreADocs(repo), docsBefore, `${label}: deny rewrote a fixture file`)
}

/**
 * Host B has no held markers. A patch draft there must not cite host A's
 * scarce marker, and it must not open an SSH write.
 */
function assertPatchDraftStaysOnHost(fixture: Fixture, historyKey: string): void {
  const spec = fixture.tfl
  assert.ok(spec, `${fixture.id}: host isolation without a patch draft`)
  const foreign = loadPersistedCoreSession(historyKey)?.citeHold
  assert.ok(!foreign || foreign.outsideHeadTail.length === 0, `${fixture.id}: host B inherited cite markers`)
  assert.ok(!foreign || foreign.droppedFiller.length === 0, `${fixture.id}: host B inherited dropped filler`)
  const home = loadPersistedCoreSession(fixture.session.historyKey)?.citeHold
  const tree = createMockTree(spec.mockTree)
  const review = reviewNpmTestFailure(spec.npmOutput, tree, foreign)
  assert.ok(review, `${fixture.id}: host B patch draft was not recognized`)
  assert.equal(tree.writeCount(), 0, `${fixture.id}: host B patch draft wrote`)
  assert.equal(sideEffectExecutionPermitted(review.hitl), false, `${fixture.id}: host B patch opened SSH`)
  assert.equal(patchWritePermitted(review.hitl), false, `${fixture.id}: host B interrupted draft is writable`)
  for (const marker of home?.outsideHeadTail ?? []) {
    assert.equal(review.draft.explanation.includes(marker), false, `${fixture.id}: host B patch cited ${marker}`)
  }
  const card = patchDraftConfirmCard(review)
  assert.equal(card.autoApproved, false, `${fixture.id}: host B patch card was auto-approved`)
  assert.ok(card.requestId, `${fixture.id}: host B patch card has no confirm id`)
  const declined = decidePatch(review, false, tree)
  assert.equal(declined.applied, false, `${fixture.id}: host B deny applied the draft`)
  assert.equal(tree.writeCount(), 0, `${fixture.id}: host B deny wrote`)
  const agreeTree = createMockTree(spec.mockTree)
  const agreed = decidePatch(review, true, agreeTree)
  assert.equal(sideEffectExecutionPermitted(agreed.state), false, `${fixture.id}: host B agree opened SSH`)
  if (agreed.applied) {
    for (const marker of home?.outsideHeadTail ?? []) {
      for (const written of agreed.written) {
        const body = agreeTree.snapshot()[written] ?? ''
        assert.equal(body.includes(marker), false, `${fixture.id}: host B applied write cited ${marker}`)
      }
    }
  }
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
      if (fixture.tfl && !(fixture.turns && fixture.turns.length > 0)) {
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
      if (fixture.tfl) {
        const hold = loadPersistedCoreSession(fixture.session.historyKey)?.citeHold
        assert.equal(hold?.stable, true, `${fixture.id}: citeHold not stable before the patch draft`)
        assert.ok((hold?.outsideHeadTail.length ?? 0) > 0, `${fixture.id}: citeHold has no marker before the patch draft`)
        assertTfl(fixture, hold)
        const after = loadPersistedCoreSession(fixture.session.historyKey)?.citeHold
        assert.equal(after?.stable, true, `${fixture.id}: patch draft destabilized citeHold`)
        assert.deepEqual(after?.outsideHeadTail, hold?.outsideHeadTail, `${fixture.id}: patch draft dropped a held marker`)
        assert.deepEqual(after?.droppedFiller, hold?.droppedFiller, `${fixture.id}: patch draft dropped a filler hold`)
      }
      if (fixture.hostScopeReturn) {
        const back = fixture.hostScopeReturn
        const prelude = fixture.isolationPrelude
        assert.ok(prelude, `${fixture.id}: hostScopeReturn needs isolationPrelude`)
        assert.notEqual(back.session.historyKey, fixture.session.historyKey, `${fixture.id}: host B shares host A's historyKey`)
        assert.notEqual(back.session.targetSessionId, fixture.session.targetSessionId, `${fixture.id}: host B shares host A's session`)
        assert.equal(back.session.historyKey, prelude.session.historyKey, `${fixture.id}: return left host A's historyKey`)
        assert.equal(back.session.targetSessionId, prelude.session.targetSessionId, `${fixture.id}: return left host A's session`)
        const hostA = back.hostProfile?.hostId || prelude.hostProfile?.hostId
        const hostB = fixture.hostProfile?.hostId
        assert.ok(hostA && hostB && hostA !== hostB, `${fixture.id}: host A and host B must differ`)
        const backFixture: Fixture = {
          ...fixture,
          hostProfile: back.hostProfile ?? prelude.hostProfile,
          session: back.session,
          seedInventory: back.seedInventory ?? prelude.seedInventory,
          hostScopeReturn: undefined
        }
        seedInventory(backFixture)
        await runTurns(backFixture, back.turns)
      }
      if (fixture.negativeCase) {
        const neg = fixture.negativeCase
        const turn = branchTurn(fixture, neg)
        if (neg.session || neg.hostProfile || neg.seedInventory) {
          const negFixture = branchFixture(fixture, neg, 'deny')
          seedInventory(negFixture)
          await runTurns(negFixture, [turn])
          if (fixture.tfl && neg.session?.historyKey) {
            assertPatchDraftStaysOnHost(fixture, neg.session.historyKey)
          }
        } else {
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
      if (fixture.cancelCase) {
        const cancelFixture = branchFixture(fixture, fixture.cancelCase, 'cancel')
        seedInventory(cancelFixture)
        await runTurns(cancelFixture, [branchTurn(fixture, fixture.cancelCase)])
      }
      if (fixture.overBudgetCase) {
        const overFixture = branchFixture(fixture, fixture.overBudgetCase, 'budget')
        seedInventory(overFixture)
        await runTurns(overFixture, [branchTurn(fixture, fixture.overBudgetCase)])
      }
    })
  }
})
