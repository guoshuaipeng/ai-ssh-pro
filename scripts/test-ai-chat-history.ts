/**
 * Richer AI chat history: optional step fields round-trip; old role+content rows still load.
 * Run: npx tsx scripts/test-ai-chat-history.ts
 */
import assert from 'node:assert/strict'
import { normalizeAiChatHistory, normalizeAiChatMessage, serializeAiChatHistory } from '../src/shared/ai-chat-history.ts'

const legacy = normalizeAiChatHistory([
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: 'hello' },
  { role: 'nope', content: 'x' },
  null
])
assert.equal(legacy.length, 2)
assert.deepEqual(legacy[0], { role: 'user', content: 'hi' })
assert.deepEqual(legacy[1], { role: 'assistant', content: 'hello' })

const rich = normalizeAiChatMessage({
  role: 'assistant',
  content: 'run uptime',
  requestId: 'req-1',
  decision: 'agreed',
  safetyMode: 'agree',
  structured: {
    description: 'Check load',
    action: 'command',
    command: 'uptime',
    riskLevel: 'low'
  }
})
assert.ok(rich)
assert.equal(rich!.requestId, 'req-1')
assert.equal(rich!.decision, 'agreed')
assert.equal(rich!.structured?.action, 'command')
assert.equal(rich!.structured?.command, 'uptime')

const junk = normalizeAiChatMessage({
  role: 'assistant',
  content: 'x',
  requestId: '  ',
  decision: 'maybe',
  structured: { action: 'nope' }
})
assert.ok(junk)
assert.equal(junk!.requestId, undefined)
assert.equal(junk!.decision, undefined)
assert.equal(junk!.structured, undefined)

const ser = serializeAiChatHistory([
  { role: 'user', content: 'a' },
  {
    role: 'assistant',
    content: 'b',
    requestId: 'id-2',
    structured: { description: 'd', action: 'tool_call', toolName: 'get_terminal_snapshot', riskLevel: 'low' }
  }
])
assert.equal(ser.length, 2)
assert.equal(ser[1]!.requestId, 'id-2')
assert.equal(ser[1]!.structured?.toolName, 'get_terminal_snapshot')

console.log('test-ai-chat-history ok')
