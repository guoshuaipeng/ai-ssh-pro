/** R31 polish: model-missing suppresses host banners (no double strip). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r31AiShots, R31_AI_SHOT_NAMES } from './ai-shot-matrix-r31.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.ok(R31_AI_SHOT_NAMES.includes('r31-model-missing-vs-prod-narrow'))
const conflict = r31AiShots().find((s) => s.name === 'r31-model-missing-vs-prod-narrow')
assert.equal(conflict?.narrow, true)
assert.ok(
  conflict?.steps?.some(
    (st) => st.op === 'aiModelMissing' && (st as { withProdBanner?: boolean }).withProdBanner === true
  )
)
assert.ok(conflict?.expect?.includes('ai-model-missing'))
assert.ok(conflict?.expect?.includes('ai-prod-auto-banner'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('const needsModelPick = aiNeedsModelPick'))
assert.ok(panel.includes('panelProdAuto && !needsModelPick'))
assert.ok(panel.includes('panelReadonly && !panelProdAuto && !needsModelPick'))
assert.ok(panel.includes('{needsModelPick ? ('))
assert.ok(panel.includes('withProdBanner'))

console.log('test-r31-model-missing-banner: ok')
