/**
 * Multi-turn Core-A scenarios. The real planner loop runs against a scripted model
 * and a fake terminal. No network, no SSH.
 *
 * Run: npx tsx --test scripts/test-core-a-scenarios.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { before, describe, it } from 'node:test'
import type { AiChatMessage, AiSettings, AiStreamEvent } from '../src/shared/ipc.ts'

const memDir = mkdtempSync(join(tmpdir(), 'core-a-mem-'))
const invDir = mkdtempSync(join(tmpdir(), 'core-a-inv-'))
process.env.AISS_CORE_MEMORY_CWD = memDir
process.env.AISS_INVENTORY_ROOT = invDir
process.env.AISS_POLL_WAIT_MS = '0'
process.env.AISS_COMMAND_SETTLE_MS = '200'

type AgentModule = typeof import('../src/main/ai-interactive-agent.ts')
let agent: AgentModule

const settings = {
  providers: [
    {
      id: 'scenario',
      name: 'scenario',
      baseURL: 'http://127.0.0.1:9/v1',
      apiKey: 'scenario-key',
      modelList: ['scenario-model']
    }
  ],
  activeProviderId: 'scenario',
  model: 'scenario-model',
  temperature: 0,
  sshParseInstructions: '',
  useOpenClaw: true
} as AiSettings

const DF = 'df -hP'
const DU = 'du -xhd1 / | sort -h | tail -n 5'
const DISK_GOAL = '这台机器磁盘快满了，请查清哪个目录占空间，不要删除任何文件'

function jsonStep(body: Record<string, unknown>): string {
  return JSON.stringify(body)
}

function goalLine(prompt: string): string {
  return prompt.split('\n').find((line) => line.startsWith('goal:')) ?? ''
}

function systemPrompt(messages: Array<{ role: string; content: string }>): string {
  return messages
    .filter((message) => message.role === 'system' && message.content !== 'json')
    .map((message) => message.content)
    .join('\n')
}

type DriveResult = {
  events: AiStreamEvent[]
  prompts: string[]
  writes: string[]
}

async function drive(input: {
  sessionId: string
  historyKey: string
  messages: AiChatMessage[]
  replies: string[]
  snapshot: () => string
  confirm?: boolean
  onWrite?: (data: string) => void
}): Promise<DriveResult> {
  const events: AiStreamEvent[] = []
  const prompts: string[] = []
  const writes: string[] = []
  const replies = [...input.replies]
  let confirmError: Error | null = null
  const noteWrite = input.onWrite
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : '{}'
    const parsed = JSON.parse(raw) as { messages?: Array<{ role: string; content: string }> }
    prompts.push(systemPrompt(parsed.messages ?? []))
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
      noteWrite?.(data)
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
        queueMicrotask(() => {
          try {
            assert.equal(writes.length, before, 'command must not be written before confirmation')
            agent.resolveAiConfirmStep(requestId, input.confirm !== false)
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
        historyKey: input.historyKey
      },
      ssh as unknown as Parameters<AgentModule['runOpenClawCoreAgentChat']>[3]
    )
  } finally {
    globalThis.fetch = previousFetch
  }
  if (confirmError) throw confirmError
  const failed = events.find((event) => event.type === 'error')
  if (failed && failed.type === 'error') throw new Error(failed.message)
  return { events, prompts, writes }
}

function assistantLines(events: AiStreamEvent[]): AiChatMessage[] {
  const lines: AiChatMessage[] = []
  for (const event of events) {
    if (event.type === 'step') lines.push({ role: 'assistant', content: event.structured.description })
  }
  return lines
}

describe('Core-A multi-turn scenarios', () => {
  before(async () => {
    agent = await import('../src/main/ai-interactive-agent.ts')
  })

  it('diagnoses a full disk across four planner turns and keeps the goal on every prompt', async () => {
    const sessionId = 'scenario-disk'
    const history: AiChatMessage[] = [{ role: 'user', content: DISK_GOAL }]
    let stage = 0
    const result = await drive({
      sessionId,
      historyKey: sessionId,
      messages: history,
      onWrite: () => {
        stage += 1
      },
      snapshot: () => {
        if (stage === 0) return 'user@web:~$'
        if (stage === 1) {
          return ['df -hP', '/dev/sda1 40G 40G 0 100% /', '/dev/sda1 Use% 100%', '1.1G /home', '48G /var/log', 'user@web:~$'].join('\n')
        }
        return [DU, '1.1G /home', '2.0G /usr', '48G /var/log', '52G /', '/dev/sda1 Use% 100%', 'user@web:~$'].join('\n')
      },
      replies: [
        jsonStep({
          description: '只读快照已看到 /var/log 占 48G，磁盘使用率 100%',
          action: 'tool_call',
          toolName: 'get_terminal_snapshot',
          toolInput: { maxLines: 800, fromCurrentCommand: true },
          riskLevel: 'low'
        }),
        jsonStep({
          description: '需要 df 确认 /dev/sda1 是否已满',
          action: 'command',
          command: DF,
          riskLevel: 'low'
        }),
        jsonStep({
          description: '接下来只读统计一级目录，找出最大目录',
          action: 'command',
          command: DU,
          riskLevel: 'low'
        }),
        jsonStep({
          description: '最大目录是 /var/log，占用 48G。磁盘 100%，未删除任何文件。',
          action: 'end',
          completed: true,
          riskLevel: 'low'
        })
      ]
    })

    const originalSnapshot = result.prompts.length
    assert.ok(originalSnapshot >= 4, `expected 4+ planner turns, got ${originalSnapshot}`)
    for (const prompt of result.prompts) {
      assert.match(goalLine(prompt), /磁盘/, 'working-memory goal is missing from a planner prompt')
      assert.match(prompt, /不要删除/, 'the do-not-delete constraint is missing from a planner prompt')
    }
    assert.deepEqual(result.writes, [`${DF}\n`, `${DU}\n`])
    assert.equal(
      result.events.filter((event) => event.type === 'step' && event.requestId).length,
      2
    )
    const ended = result.events.find((event) => event.type === 'step' && event.structured.action === 'end')
    assert.ok(ended && ended.type === 'step')
    assert.match(ended.structured.description, /\/var\/log/)
    assert.ok(result.events.some((event) => event.type === 'done'))
    assert.ok(result.prompts.some((prompt) => prompt.includes('100%')))
    assert.equal(stage, 2)
  })

  it('switches topic, then recalls the original disk fact after the window is compacted', async () => {
    const sessionId = 'scenario-switch'
    const history: AiChatMessage[] = [{ role: 'user', content: DISK_GOAL }]
    const disk = await drive({
      sessionId,
      historyKey: sessionId,
      messages: history,
      snapshot: () =>
        ['df -hP', '/dev/sda1 40G 40G 0 100% /', '48G /var/log', '2.0G /usr', '1.1G /home', 'user@web:~$'].join('\n'),
      replies: [
        jsonStep({
          description: '只读快照已看到 /var/log 占 48G，磁盘使用率 100%',
          action: 'tool_call',
          toolName: 'get_terminal_snapshot',
          toolInput: { maxLines: 800, fromCurrentCommand: true },
          riskLevel: 'low'
        }),
        jsonStep({
          description: 'df 确认 /dev/sda1 已满，最大目录仍要核对',
          action: 'command',
          command: DF,
          riskLevel: 'low'
        }),
        jsonStep({
          description: '最大目录是 /var/log，占用 48G',
          action: 'end',
          completed: true,
          riskLevel: 'low'
        })
      ]
    })
    history.push(...assistantLines(disk.events))

    history.push({ role: 'user', content: '换个问题：nginx 为什么起不来' })
    const nginx = await drive({
      sessionId,
      historyKey: sessionId,
      messages: history,
      snapshot: () =>
        ['systemctl status nginx --no-pager', 'Active: inactive', 'Main PID: 0', 'Docs: man:nginx', 'no journal errors', 'user@web:~$'].join('\n'),
      replies: [
        jsonStep({
          description: '先不看磁盘，nginx 当前没有运行',
          action: 'end',
          completed: true,
          riskLevel: 'low'
        })
      ]
    })
    assert.match(goalLine(nginx.prompts[0] ?? ''), /nginx/)
    assert.doesNotMatch(goalLine(nginx.prompts[0] ?? ''), /不要删除/)
    history.push(...assistantLines(nginx.events))

    for (let i = 0; i < 12; i++) {
      history.push({ role: 'user', content: `nginx 继续看错误日志 ${i}` })
      history.push({ role: 'assistant', content: `nginx note ${i} 没有新的磁盘信息` })
    }
    const returnQuestion = '回到刚才的磁盘问题，最大的目录是哪一个'
    assert.equal(returnQuestion.includes('/var/log'), false)
    history.push({ role: 'user', content: returnQuestion })

    const back = await drive({
      sessionId,
      historyKey: sessionId,
      messages: history,
      snapshot: () => ['user@web:~$', 'uptime 4 days', 'load average: 0.10', 'tasks: 120', 'memory ok', 'user@web:~$'].join('\n'),
      replies: [
        jsonStep({
          description: '根据先前证据，最大目录仍是 /var/log',
          action: 'end',
          completed: true,
          riskLevel: 'low'
        })
      ]
    })
    const prompt = back.prompts[0] ?? ''
    assert.match(goalLine(prompt), /磁盘/)
    assert.doesNotMatch(goalLine(prompt), /nginx/)
    assert.match(prompt, /\/var\/log/, 'the early /var/log fact was dropped after compaction')
    assert.match(prompt, /48G/)
    assert.equal(back.writes.length, 0)
  })

  it('ends when the same terminal snapshot repeats and the evidence is already enough', async () => {
    const sessionId = 'scenario-loop'
    const evidence = [
      'df -hP',
      '/dev/sda1 40G 40G 0 100% /',
      '48G /var/log',
      '2.0G /usr',
      '1.1G /home',
      '0.5G /tmp',
      'user@web:~$'
    ].join('\n')
    const result = await drive({
      sessionId,
      historyKey: sessionId,
      messages: [{ role: 'user', content: '磁盘已经满了，证据够了就结束，不要反复读取快照' }],
      snapshot: () => evidence,
      replies: Array.from({ length: 8 }, () =>
        jsonStep({
          description: '再读一次终端快照',
          action: 'tool_call',
          toolName: 'get_terminal_snapshot',
          toolInput: { maxLines: 800, fromCurrentCommand: true },
          riskLevel: 'low'
        })
      )
    })

    assert.ok(result.prompts.length <= 3, `snapshot loop made ${result.prompts.length} model calls`)
    assert.ok(result.prompts.length < 8)
    for (const prompt of result.prompts) assert.match(goalLine(prompt), /磁盘/)
    assert.equal(result.writes.length, 0)
    assert.equal(
      result.events.filter((event) => event.type === 'step' && event.requestId).length,
      0
    )
    const ended = result.events.find((event) => event.type === 'step' && event.structured.action === 'end')
    assert.ok(ended && ended.type === 'step')
    assert.match(ended.structured.description, /自动结束/)
    assert.doesNotMatch(ended.structured.description, /已轮询/)
    assert.ok(result.events.some((event) => event.type === 'done'))
  })
})
