/** R20: policy-menu-open + pending-dock-narrow screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r20AiShots, R20_AI_SHOT_NAMES } from './ai-shot-matrix-r20.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r20AiShots()
assert.deepEqual(shots.map((s) => s.name), R20_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const policy = shots.find((s) => s.name === 'r20-policy-menu-open')
assert.ok(policy?.steps?.some((st) => st.op === 'aiComposerPop' && st.which === 'safety'))
assert.ok(policy?.expect?.includes('ai-safety-pop'))
assert.ok(policy?.expect?.includes('is-open'))

const dock = shots.find((s) => s.name === 'r20-pending-dock-narrow')
assert.equal(dock?.narrow, true)
assert.ok(dock?.steps?.some((st) => st.op === 'aiConfirm'))
assert.ok(dock?.expect?.includes('ai-pending-confirm'))
assert.ok(dock?.expect?.includes('data-r19-narrow'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiComposerPop'))
assert.ok(hooks.includes('aiConfirm'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiComposerPop'") || panel.includes("detail.op === 'aiComposerPop'"))
assert.ok(panel.includes("detail.op !== 'aiConfirm'") || panel.includes("detail.op === 'aiConfirm'") || panel.includes("op !== 'aiConfirm'"))
assert.ok(panel.includes('data-testid="ai-safety-pop"'))
assert.ok(panel.includes('data-testid="ai-pending-confirm"'))
assert.ok(panel.includes('data-r19-narrow="1"'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiComposerPop'"))
assert.ok(app.includes("detail.op === 'aiConfirm'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r20.mjs'"))
assert.ok(har.includes('r20AiShots()'))

console.log('test-r20-ai-shot-harness: ok', R20_AI_SHOT_NAMES.length)
