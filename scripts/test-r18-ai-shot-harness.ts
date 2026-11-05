/** R18: plan-step-align + audit↔dialog deep-link screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r18AiShots, R18_AI_SHOT_NAMES } from './ai-shot-matrix-r18.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r18AiShots()
assert.deepEqual(shots.map((s) => s.name), R18_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
for (const op of ['aiPlanStepAlign', 'aiExecAuditLink', 'aiAuditFocus']) {
  assert.ok(hooks.includes(op), op + ' typed')
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
for (const op of ['aiPlanStepAlign', 'aiExecAuditLink', 'aiAuditFocus']) {
  assert.ok(panel.includes("detail?.op === '" + op + "'"), 'AIPanel handles ' + op)
}
assert.ok(panel.includes('screenshotAuditFocusId'))
assert.ok(panel.includes('shot-r18-align'))
assert.ok(panel.includes('aud-r18-link') || panel.includes('aud-r18-focus'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiPlanStepAlign'"))
assert.ok(app.includes("detail.op === 'aiExecAuditLink'"))
assert.ok(app.includes("detail.op === 'aiAuditFocus'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r18.mjs'"))
assert.ok(har.includes('r18AiShots()'))

const align = shots.find((s) => s.name === 'r18-plan-step-align')
assert.ok(align?.expect?.includes('data-aligned-step'))
const openAi = shots.find((s) => s.name === 'r18-audit-open-ai')
assert.ok(openAi?.steps?.some((st) => st.op === 'menu' && st.action === 'auditLog'))

console.log('test-r18-ai-shot-harness: ok', R18_AI_SHOT_NAMES.length)
