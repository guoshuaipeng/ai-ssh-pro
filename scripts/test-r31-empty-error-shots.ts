/** R31: H08 empty/error narrow screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r31AiShots, R31_AI_SHOT_NAMES } from './ai-shot-matrix-r31.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r31AiShots()
assert.deepEqual(shots.map((s) => s.name), R31_AI_SHOT_NAMES)
assert.equal(R31_AI_SHOT_NAMES.length, 7)

const emptyN = shots.find((s) => s.name === 'r31-empty-narrow')
assert.equal(emptyN?.narrow, true)
assert.ok(emptyN?.steps?.some((st) => st.op === 'aiEmptyConfig'))
assert.ok(emptyN?.expect?.includes('ai-empty-state'))
assert.ok(emptyN?.expect?.includes('ai-config-setup'))

const missN = shots.find((s) => s.name === 'r31-model-missing-narrow')
assert.equal(missN?.narrow, true)
assert.ok(missN?.steps?.some((st) => st.op === 'aiModelMissing'))
assert.ok(missN?.expect?.includes('ai-model-missing'))
assert.ok(missN?.expect?.includes('ai-prod-auto-banner'))

const errS = shots.find((s) => s.name === 'r31-error-settings-narrow')
assert.ok(errS?.steps?.some((st) => st.op === 'aiError' && (st as { errorCode?: string }).errorCode === 'AI_HTTP_401'))
assert.ok(errS?.expect?.includes('settings'))

const errR = shots.find((s) => s.name === 'r31-error-retry-narrow')
assert.ok(errR?.steps?.some((st) => st.op === 'aiError' && (st as { errorCode?: string }).errorCode === 'AI_HTTP_429'))
assert.ok(errR?.expect?.includes('retry'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiEmptyConfig'))
assert.ok(hooks.includes('aiModelMissing'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiEmptyConfig'"))
assert.ok(panel.includes("detail?.op === 'aiModelMissing'"))
assert.ok(panel.includes('screenshotEmptyConfig'))
assert.ok(panel.includes('screenshotModelMissing'))
assert.ok(panel.includes('screenshotEmptyConfigRef'))

const feat = norm('src/renderer/src/features.css')
const featIdx = feat.indexOf('R31 Round31: H08 empty/error narrow wrap')
assert.ok(featIdx >= 0)
const featBlock = feat.slice(featIdx, featIdx + 900)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(featBlock), false, 'no token fallbacks in R31 features CSS')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R31 Round31: model-missing + error CTA narrow'))
const cssIdx = css.indexOf('R31 Round31: model-missing + error CTA narrow')
const cssBlock = css.slice(cssIdx, cssIdx + 900)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(cssBlock), false, 'no token fallbacks in R31 styles CSS')

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r31.mjs'"))
assert.ok(har.includes('r31AiShots()'))

const readme = norm('docs/screenshots/r31/README.md')
assert.ok(readme.includes('aiEmptyConfig'))
assert.ok(readme.includes('aiModelMissing'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes('aiEmptyConfig'))
assert.ok(app.includes('aiModelMissing'))

const conflict = shots.find((s) => s.name === 'r31-model-missing-vs-prod-narrow')
assert.ok(conflict?.steps?.some((st) => st.op === 'aiModelMissing'))
console.log('test-r31-empty-error-shots: ok', R31_AI_SHOT_NAMES.length)
