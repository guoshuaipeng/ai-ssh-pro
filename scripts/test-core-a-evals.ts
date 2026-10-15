/**
 * Coordinator multi-turn evals. Every `*.json` file in tests/fixtures/core-a/
 * is a scenario. Drop a new file there; this runner picks it up with no edit.
 * The real planner runs against a scripted model and a fake terminal.
 *
 * Run: npx tsx --test scripts/test-core-a-evals.ts
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { AiChatMessage, AiSettings, AiStreamEvent } from '../src/shared/ipc.ts'

const memDir = mkdtempSync(join(tmpdir(), 'core-a-eval-mem-'))
const invDir = mkdtempSync(join(tmpdir(), 'core-a-eval-inv-'))
process.env.AISS_CORE_MEMORY_CWD = memDir
process.env.AISS_INVENTORY_ROOT = invDir
process.env.AISS_POLL_WAIT_MS = '0'
process.env.AISS_COMMAND_SETTLE_MS = '200'

type AgentModule = typeof import('../src/main/ai-interactive-agent.ts')
let agent: AgentModule

type Reply = {
  description: string
  action: 'tool_call' | 'command' | 'end'
  toolName?: string
  toolInput?: Record<string, unknown>
  command?: string
  riskLevel?: 'low' | 'medium' | 'high'
  completed?: boolean
  notes?: string
}

type Phase = {
  user: string
  snapshot: string
  afterWrites?: string[]
  replies: Reply[]
  expectGoal?: string
  filler?: Array<{ user: string; assistant: string }>
}

type RecallExpect = {
  fact: string
  absentFromRecentMessages: boolean
  presentIn: Array<'runningSummary' | 'recall' | 'observations'>
}

type Expectation = {
  minPlannerTurns?: number
  maxModelCalls?: number
  maxSnapshots?: number
  goalMatches?: string
  constraintMatches?: string
  endMatches?: string[]
  endMustNot?: string[]
  lastPromptMatches?: string[]
  writes?: string[]
  forbiddenWrites?: string[]
  confirmCount?: number
  lowRiskConfirm?: boolean
  highRiskConfirm?: boolean
  denied?: boolean
  requireContextSlices?: boolean
  recall?: RecallExpect
}

type Fixture = {
  id: string
  title: string
  sessionId: string
  debugTurnId: string
  autoApproveLowRisk: false
  /** When false, confirmStep declines. Default is approve. */
  confirm?: boolean
  phases: Phase[]
  expect: Expectation
}

const SLICE_NAMES = ['working', 'runningSummary', 'recall', 'recentWindow', 'system'] as const

const SECTION_HEADINGS: Record<RecallExpect['presentIn'][number], string> = {
  runningSummary: '较早对话摘要：',
  recall: '相关历史回忆：',
  observations: '工作区观测笔记（跨轮持久）：'
}

function loadFixtures(): Fixture[] {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/core-a')
  const names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
  assert.ok(names.length > 0, `no fixtures in ${dir}`)
  const fixtures = names.map((name) => {
    const fixture = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Fixture
    assertFixtureShape(fixture, name)
    return fixture
  })
  const ids = fixtures.map((fixture) => fixture.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate fixture id in ${ids.join(', ')}`)
  return fixtures.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

function assertFixtureShape(fixture: Fixture, file: string): void {
  assert.equal(typeof fixture.id, 'string', `${file} id`)
  assert.ok(fixture.id.trim(), `${file} id is blank`)
  assert.equal(typeof fixture.title, 'string', `${file} title`)
  assert.equal(typeof fixture.sessionId, 'string', `${file} sessionId`)
  assert.equal(typeof fixture.debugTurnId, 'string', `${file} debugTurnId`)
  assert.equal(fixture.autoApproveLowRisk, false, `${file} autoApproveLowRisk`)
  assert.ok(Array.isArray(fixture.phases) && fixture.phases.length > 0, `${file} phases`)
  assert.ok(fixture.expect && typeof fixture.expect === 'object', `${file} expect`)
  for (const phase of fixture.phases) {
    assert.equal(typeof phase.user, 'string', `${file} phase.user`)
    assert.equal(typeof phase.snapshot, 'string', `${file} phase.snapshot`)
    assert.ok(Array.isArray(phase.replies) && phase.replies.length > 0, `${file} phase.replies`)
  }
}

/** Replies the planner may consume before a declined command stops the run. */
function repliesUntilFirstCommand(fixture: Fixture): number {
  let count = 0
  for (const phase of fixture.phases) {
    for (const reply of phase.replies) {
      count += 1
      if (reply.action === 'command') return count
    }
  }
  return count
}

function literalRegExp(pattern: string): RegExp {
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

function systemPrompt(messages: Array<{ role: string; content: string }>): string {
  return messages
    .filter((message) => message.role === 'system' && message.content !== 'json')
    .map((message) => message.content)
    .join('\n')
}

function goalLine(prompt: string): string {
  return prompt.split('\n').find((line) => line.startsWith('goal:')) ?? ''
}

function sectionBody(prompt: string, heading: string): string {
  const start = prompt.indexOf(heading)
  if (start < 0) return ''
  const rest = prompt.slice(start + heading.length).replace(/^\n/, '')
  const end = rest.search(
    /\n(?:工作记忆（当前目标）：|较早对话摘要：|相关历史回忆：|最近核心记忆：|最近已执行命令：|任务图（Task Graph）：|最近工具结果评分：|当前失败连续计数：|JSON 字段|本轮策略提示：|当前关联 SSH|当前未关联 SSH|当前主机知识库|当前未命中主机|用户附带终端片段：|最近一次终端快照：|上一条命令已发送|---)/
  )
  return (end < 0 ? rest : rest.slice(0, end)).trim()
}

type DriveResult = {
  events: AiStreamEvent[]
  prompts: string[]
  recentBodies: string[]
  writes: string[]
  settings: AiSettings
}

async function drive(input: {
  sessionId: string
  historyKey: string
  debugTurnId: string
  autoApproveLowRisk: false
  messages: AiChatMessage[]
  replies: Reply[]
  snapshot: () => string
  onWrite?: () => void
  approve?: boolean
}): Promise<DriveResult> {
  const events: AiStreamEvent[] = []
  const prompts: string[] = []
  const recentBodies: string[] = []
  const writes: string[] = []
  const replies = input.replies.map((reply) => JSON.stringify(reply))
  let confirmError: Error | null = null
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
    useOpenClaw: true,
    autoApproveLowRisk: input.autoApproveLowRisk
  } as AiSettings
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : '{}'
    const parsed = JSON.parse(raw) as { messages?: Array<{ role: string; content: string }> }
    const messages = parsed.messages ?? []
    prompts.push(systemPrompt(messages))
    recentBodies.push(
      messages
        .filter((message) => message.role !== 'system')
        .map((message) => message.content)
        .join('\n')
    )
    const next = replies.shift()
    if (!next) throw new Error('scripted model ran out of replies')
    return new Response(JSON.stringify({ choices: [{ message: { content: next } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  const ssh = {
    getRingSnapshot: () => input.snapshot(),
    write: (_sessionId: string, data: string) => {
      writes.push(data)
      input.onWrite?.()
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
        assert.notEqual(ev.autoApproved, true, 'command must not be auto-approved')
        queueMicrotask(() => {
          try {
            assert.equal(writes.length, before, 'command must not be written before confirmStep')
            agent.resolveAiConfirmStep(requestId, input.approve !== false)
          } catch (error) {
            confirmError = error instanceof Error ? error : new Error(String(error))
            agent.resolveAiConfirmStep(requestId, false)
          }
        })
      }
    }
  }

  try {
    await agent.runOpenClawCoreAgentChat(
      wc as unknown as Parameters<AgentModule['runOpenClawCoreAgentChat']>[0],
      settings,
      {
        messages: input.messages,
        targetSessionId: input.sessionId,
        historyKey: input.historyKey,
        debugTurnId: input.debugTurnId
      },
      ssh as unknown as Parameters<AgentModule['runOpenClawCoreAgentChat']>[3]
    )
  } finally {
    globalThis.fetch = previousFetch
  }
  if (confirmError) throw confirmError
  const failed = events.find((event) => event.type === 'error')
  if (failed && failed.type === 'error') throw new Error(failed.message)
  return { events, prompts, recentBodies, writes, settings }
}

function assistantLines(events: AiStreamEvent[]): AiChatMessage[] {
  const lines: AiChatMessage[] = []
  for (const event of events) {
    if (event.type === 'step') lines.push({ role: 'assistant', content: event.structured.description })
  }
  return lines
}

function assertContextSlices(events: AiStreamEvent[], debugTurnId: string): void {
  const slices = events.filter(
    (event) => event.type === 'debug' && event.payload.debugTurnId === debugTurnId && event.payload.entry.kind === 'context'
  )
  assert.ok(slices.length > 0, 'debugTurnId produced no context-slice entry')
  for (const event of slices) {
    if (event.type !== 'debug' || event.payload.entry.kind !== 'context') continue
    const names = event.payload.entry.slices.map((slice) => slice.name)
    assert.deepEqual(names, [...SLICE_NAMES])
    const working = event.payload.entry.slices.find((slice) => slice.name === 'working')
    assert.ok(working && working.chars > 0, 'working-memory slice is empty')
    assert.equal(working.items, 1)
    assert.ok(event.payload.entry.totalChars > 0)
    for (const slice of event.payload.entry.slices) assert.equal(typeof slice.chars, 'number')
  }
}

function assertWorkingMemory(prompts: string[], goalPattern?: string, constraintPattern?: string): void {
  assert.ok(prompts.length > 0, 'planner never ran')
  for (const prompt of prompts) {
    assert.match(goalLine(prompt), /\S/, 'working memory goal is missing from a planner turn')
    if (goalPattern) assert.match(goalLine(prompt), literalRegExp(goalPattern))
    if (constraintPattern) assert.match(prompt, literalRegExp(constraintPattern))
  }
}

describe('Core-A eval fixtures', { concurrency: 1 }, () => {
  before(async () => {
    agent = await import('../src/main/ai-interactive-agent.ts')
  })

  const fixtures = loadFixtures()

  for (const fixture of fixtures) {
    it(`${fixture.id} ${fixture.title}`, async () => {
      assert.equal(fixture.autoApproveLowRisk, false)
      const history: AiChatMessage[] = []
      const prompts: string[] = []
      const recentBodies: string[] = []
      const writes: string[] = []
      const events: AiStreamEvent[] = []
      let settings: AiSettings | null = null

      for (const phase of fixture.phases) {
        history.push({ role: 'user', content: phase.user })
        let stage = 0
        const result = await drive({
          sessionId: fixture.sessionId,
          historyKey: fixture.sessionId,
          debugTurnId: fixture.debugTurnId,
          autoApproveLowRisk: fixture.autoApproveLowRisk,
          messages: history,
          replies: phase.replies,
          approve: fixture.confirm !== false,
          onWrite: () => {
            stage += 1
          },
          snapshot: () => {
            if (stage === 0 || !phase.afterWrites?.length) return phase.snapshot
            return phase.afterWrites[Math.min(stage, phase.afterWrites.length) - 1] ?? phase.snapshot
          }
        })
        history.push(...assistantLines(result.events))
        for (const pair of phase.filler ?? []) {
          history.push({ role: 'user', content: pair.user }, { role: 'assistant', content: pair.assistant })
        }
        prompts.push(...result.prompts)
        recentBodies.push(...result.recentBodies)
        writes.push(...result.writes)
        events.push(...result.events)
        settings = result.settings
        if (phase.expectGoal) {
          for (const prompt of result.prompts) assert.match(goalLine(prompt), literalRegExp(phase.expectGoal))
        }
      }

      const expect = fixture.expect
      assert.equal(settings?.autoApproveLowRisk, false)
      assertWorkingMemory(prompts, expect.goalMatches, expect.constraintMatches)
      if (expect.minPlannerTurns != null) {
        assert.ok(prompts.length >= expect.minPlannerTurns, `expected ${expect.minPlannerTurns}+ planner turns, got ${prompts.length}`)
      }
      if (expect.maxModelCalls != null) {
        assert.ok(prompts.length <= expect.maxModelCalls, `planner made ${prompts.length} model calls`)
      }
      if (expect.maxSnapshots != null) {
        const snaps = events.filter(
          (event) =>
            event.type === 'step' &&
            event.structured.action === 'tool_call' &&
            event.structured.toolName === 'get_terminal_snapshot'
        )
        assert.ok(snaps.length <= expect.maxSnapshots, `snapshot count ${snaps.length}`)
      }
      if (expect.writes) assert.deepEqual(writes, expect.writes)
      if (expect.forbiddenWrites) {
        for (const write of writes) {
          for (const blocked of expect.forbiddenWrites) {
            assert.equal(write.includes(blocked), false, `forbidden command was written: ${blocked}`)
          }
        }
      }
      if (expect.confirmCount != null) {
        assert.equal(events.filter((event) => event.type === 'step' && event.requestId).length, expect.confirmCount)
      }
      if (expect.endMatches) {
        const ended = [...events].reverse().find((event) => event.type === 'step' && event.structured.action === 'end')
        assert.ok(ended && ended.type === 'step')
        for (const pattern of expect.endMatches) assert.match(ended.structured.description, literalRegExp(pattern))
        for (const pattern of expect.endMustNot ?? []) {
          assert.doesNotMatch(ended.structured.description, literalRegExp(pattern))
        }
      }
      if (expect.lastPromptMatches) {
        const last = prompts[prompts.length - 1] ?? ''
        for (const pattern of expect.lastPromptMatches) assert.match(last, literalRegExp(pattern))
      }
      if (expect.lowRiskConfirm) {
        const command = events.find((event) => event.type === 'step' && event.structured.action === 'command')
        assert.ok(command && command.type === 'step')
        assert.equal(command.structured.riskLevel, 'low')
        assert.ok(command.requestId, 'low-risk command did not wait for confirmStep')
        assert.notEqual(command.autoApproved, true)
      }
      if (expect.highRiskConfirm) {
        const command = events.find((event) => event.type === 'step' && event.structured.action === 'command')
        assert.ok(command && command.type === 'step')
        assert.equal(command.structured.riskLevel, 'high')
        assert.ok(command.requestId, 'high-risk command did not wait for confirmStep')
        assert.notEqual(command.autoApproved, true)
      }
      if (expect.denied) {
        assert.equal(fixture.confirm, false, 'denied scenarios must set confirm:false')
        assert.equal(writes.length, 0)
        assert.ok(events.some((event) => event.type === 'cancelled'))
        assert.equal(prompts.length, repliesUntilFirstCommand(fixture), 'planner continued after the user declined')
      }
      if (expect.requireContextSlices) assertContextSlices(events, fixture.debugTurnId)
      if (expect.recall) {
        const lastPrompt = prompts[prompts.length - 1] ?? ''
        const lastRecent = recentBodies[recentBodies.length - 1] ?? ''
        if (expect.recall.absentFromRecentMessages) {
          assert.equal(lastRecent.includes(expect.recall.fact), false, 'fact is still inside the raw transcript window')
        }
        for (const slot of expect.recall.presentIn) {
          const body = sectionBody(lastPrompt, SECTION_HEADINGS[slot])
          assert.match(body, new RegExp(expect.recall.fact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${slot} dropped ${expect.recall.fact}`)
        }
      }
      if (expect.denied) {
        assert.equal(events.some((event) => event.type === 'error'), false)
      } else {
        assert.ok(events.some((event) => event.type === 'done'))
      }
    })
  }
})
