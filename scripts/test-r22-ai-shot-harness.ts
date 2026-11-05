/** R22: aiFailureEvidence wide/narrow screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r22AiShots, R22_AI_SHOT_NAMES } from './ai-shot-matrix-r22.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r22AiShots()
assert.deepEqual(shots.map((s) => s.name), R22_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const wide = shots.find((s) => s.name === 'r22-failure-evidence')
assert.ok(wide)
assert.notEqual(wide?.narrow, true)
assert.ok(wide?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(wide?.expect?.includes('ai-failure-evidence'))
assert.ok(wide?.expect?.includes('ai-failure-retry'))

const narrow = shots.find((s) => s.name === 'r22-failure-evidence-narrow')
assert.equal(narrow?.narrow, true)
assert.ok(narrow?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(narrow?.expect?.includes('has-failure-pin'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiFailureEvidence'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiFailureEvidence'"))
assert.ok(panel.includes('shot-r21-fail') || panel.includes('S27_FAIL_CMD'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiFailureEvidence'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r22.mjs'"))
assert.ok(har.includes('r22AiShots()'))

const er = norm('src/renderer/src/components/ExecReplay.tsx')
assert.ok(er.includes('data-testid="ai-failure-evidence"'))
assert.ok(er.includes('data-testid="ai-failure-retry"'))

console.log('test-r22-ai-shot-harness: ok', R22_AI_SHOT_NAMES.length)
