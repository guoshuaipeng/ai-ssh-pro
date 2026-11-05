/** R17: ask-progress + sticky batch screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r17AiShots, R17_AI_SHOT_NAMES } from './ai-shot-matrix-r17.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r17AiShots()
assert.deepEqual(shots.map((s) => s.name), R17_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.find((s) => s.name === 'r17-batch-sticky-narrow')?.narrow === true)
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.includes('querySelector')))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
for (const op of ['aiAskProgress', 'aiBatchSticky']) {
  assert.ok(hooks.includes(op), op + ' typed')
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
for (const op of ['aiAskProgress', 'aiBatchSticky']) {
  assert.ok(panel.includes("detail?.op === '" + op + "'"), 'AIPanel handles ' + op)
}
assert.ok(panel.includes('shot-r17-ask'))
assert.ok(panel.includes("policy: 'ask'"))
assert.ok(panel.includes('ai-batch-copy-bar') || panel.includes('aiBatchSticky'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiAskProgress'"))
assert.ok(app.includes("detail.op === 'aiBatchSticky'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r17.mjs'"))
assert.ok(har.includes('r17AiShots()'))

console.log('test-r17-ai-shot-harness: ok', R17_AI_SHOT_NAMES.length)
