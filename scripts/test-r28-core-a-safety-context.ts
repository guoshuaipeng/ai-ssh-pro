/** R28 high-freq: Core-A fixtures forward safetyContext into the chat payload. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const evals = norm('scripts/test-core-a-evals.ts')
assert.ok(evals.includes('Round 28: optional host safety'))
assert.ok(evals.includes('safetyContext?:'))
assert.ok(evals.includes("protection?: 'normal' | 'production' | 'readonly'"))
assert.ok(evals.includes('Round 28: pass fixture safetyContext'))
assert.ok(evals.includes('safetyContext: input.fixture.safetyContext'))
assert.ok(evals.includes('input.fixture.safetyContext.hostId || input.fixture.hostProfile?.hostId'))

const s12 = JSON.parse(norm('tests/fixtures/core-a/core-a-s12-high-risk-confirm.json'))
assert.equal(s12.hostProfile?.hostId, 'host-prod-web-01')
assert.equal(s12.safetyContext?.protection, 'production')
assert.equal(s12.safetyContext?.production, true)
assert.equal(s12.safetyContext?.hostId, 'host-prod-web-01')

const ipc = norm('src/shared/ipc.ts')
assert.ok(ipc.includes('safetyContext?:'))
assert.ok(ipc.includes("protection?: 'normal' | 'production' | 'readonly'"))

console.log('test-r28-core-a-safety-context: ok')
