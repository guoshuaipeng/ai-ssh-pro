/**
 * 本地自测：JSON 解析容错 + 终端快照抓取（无需 API Key）
 * 运行：npx tsx scripts/test-core-a.ts
 */
import { parseAssistantStep } from '../src/main/ai-interactive-agent.ts'
import { SshSessionManager, type ManagedSession } from '../src/main/ssh-manager.ts'
import { RingBuffer } from '../src/main/ring-buffer.ts'

let passed = 0
let failed = 0

function ok(name: string, cond: boolean) {
  if (cond) {
    passed++
    console.log(`[PASS] ${name}`)
  } else {
    failed++
    console.log(`[FAIL] ${name}`)
  }
}

// --- 1) 解析：缺 description（用户遇到的 Zod 报错场景）---
const missingDesc = JSON.stringify({
  action: 'command',
  command: 'uptime',
  riskLevel: 'low'
})
const r1 = parseAssistantStep(missingDesc)
ok('missing description -> structured', r1.structured != null)
ok('missing description has description text', Boolean(r1.structured?.description?.trim()))
ok('missing description action=command', r1.structured?.action === 'command')

const aliasMsg = JSON.stringify({
  action: 'tool_call',
  message: '读取终端快照',
  toolName: 'get_terminal_snapshot',
  toolInput: { fromCurrentCommand: true, maxLines: 500 }
})
const r2 = parseAssistantStep(aliasMsg)
ok('message alias -> structured', r2.structured != null)
ok('message alias -> description', Boolean(r2.structured?.description?.includes('读取终端快照')))

// --- 2) 快照：模拟 AI 同意后 write + 终端回显 ---
const m = new SshSessionManager()
const ring = new RingBuffer(4000)
const fake: ManagedSession = {
  sessionId: 'test-session',
  meta: {
    sessionId: 'test-session',
    host: '127.0.0.1',
    port: 22,
    username: 'test',
    connectedAt: Date.now(),
    status: 'connected'
  },
  client: {} as ManagedSession['client'],
  stream: { write: () => true } as ManagedSession['stream'],
  ring,
  owner: {} as ManagedSession['owner'],
  commandMarkers: [],
  pendingInput: ''
}
// @ts-expect-error 测试注入会话
m.sessions.set('test-session', fake)
m.write('test-session', 'uptime\n')
ring.appendUtf8(' 17:47:01 up 10 days, load average: 0.34, 0.21, 0.18')
const snap1 = m.getRingSnapshot('test-session', {
  maxLines: 1200,
  fromCurrentCommand: true,
  includeCommandLine: true
})
ok('snapshot has uptime output', snap1 != null && snap1.includes('load average'))
ok('snapshot has command line', snap1 != null && snap1.includes('uptime'))

ring.appendUtf8('\nnext line after uptime\n')
const snap2 = m.getRingSnapshot('test-session', {
  maxLines: 1200,
  fromCurrentCommand: true,
  includeCommandLine: true
})
ok('snapshot includes appended line', snap2 != null && snap2.includes('next line'))

console.log('\n---')
console.log(`done: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
