/** R30 polish: prod↔readonly contrast screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r30AiShots, R30_AI_SHOT_NAMES } from './ai-shot-matrix-r30.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r30AiShots()
assert.deepEqual(shots.map((s) => s.name), R30_AI_SHOT_NAMES)
assert.equal(R30_AI_SHOT_NAMES.length, 4)

const prod = shots.find((s) => s.name === 'r30-contrast-prod')
assert.ok(prod?.steps?.some((st) => st.op === 'aiProdBanner'))
assert.ok(prod?.expect?.includes('ai-prod-auto-banner'))
assert.ok(prod?.expect?.includes('ai-readonly-banner'))
assert.ok(prod?.expect?.includes('自动'))
assert.equal(prod?.narrow, undefined)

const prodN = shots.find((s) => s.name === 'r30-contrast-prod-narrow')
assert.equal(prodN?.narrow, true)
assert.ok(prodN?.steps?.some((st) => st.op === 'aiProdBanner'))

const ro = shots.find((s) => s.name === 'r30-contrast-readonly')
assert.ok(ro?.steps?.some((st) => st.op === 'aiReadonlyBanner'))
assert.ok(ro?.expect?.includes('ai-readonly-banner'))
assert.ok(ro?.expect?.includes('只读'))
assert.ok(ro?.expect?.includes('ai-prod-auto-banner'))

const roN = shots.find((s) => s.name === 'r30-contrast-readonly-narrow')
assert.equal(roN?.narrow, true)

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r30.mjs'"))
assert.ok(har.includes('r30AiShots()'))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R30 Round30: host banner touch + narrow'))

const readme = norm('docs/screenshots/r30/README.md')
assert.ok(readme.includes('contrast'))
assert.ok(readme.includes('aiProdBanner'))
assert.ok(readme.includes('aiReadonlyBanner'))

console.log('test-r30-contrast-shots: ok', R30_AI_SHOT_NAMES.length)
