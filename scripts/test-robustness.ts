import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { attachClientGuards } from '../src/main/ssh-guards'
import {
  AUTO_RECONNECT_DELAYS_MS,
  autoReconnectDelay,
  classifyLatency,
  normalizeSessionId
} from '../src/shared/workspace-features'

// repeated errors after ready must not throw and onLost fires once
const client = new EventEmitter()
const reasons: string[] = []
attachClientGuards(client, 'test', (r) => reasons.push(r))
client.emit('error', new Error('read ECONNRESET'))
client.emit('error', new Error('keepalive timeout'))
client.emit('close')
assert.deepEqual(reasons, ['read ECONNRESET'])

const c2 = new EventEmitter()
const r2: string[] = []
attachClientGuards(c2, 'test', (r) => r2.push(r))
c2.emit('close')
assert.deepEqual(r2, ['closed'])

// a throwing onLost must not escape the emitter
const c3 = new EventEmitter()
attachClientGuards(c3, 'test', () => {
  throw new Error('boom')
})
const origErr = console.error
console.error = () => {}
c3.emit('close')
console.error = origErr

assert.equal(classifyLatency(20), 'good')
assert.equal(classifyLatency(300), 'fair')
assert.equal(classifyLatency(900), 'poor')
assert.equal(classifyLatency(null), 'down')
assert.equal(classifyLatency(Number.NaN), 'down')
assert.equal(classifyLatency(-1), 'down')

assert.equal(normalizeSessionId(' abc '), 'abc')
assert.equal(normalizeSessionId(''), null)
assert.equal(normalizeSessionId(42), null)
assert.equal(normalizeSessionId('x'.repeat(200)), null)

assert.equal(autoReconnectDelay(1), 2000)
assert.equal(autoReconnectDelay(3), 10_000)
assert.equal(autoReconnectDelay(AUTO_RECONNECT_DELAYS_MS.length + 1), null)
assert.equal(autoReconnectDelay(0), null)
assert.equal(autoReconnectDelay(1.5), null)

console.log('robustness ok')
