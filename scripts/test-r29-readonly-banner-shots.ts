/** R29 polish: readonly banner screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r29AiShots, R29_AI_SHOT_NAMES } from './ai-shot-matrix-r29.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r29AiShots()
assert.deepEqual(shots.map((s) => s.name), R29_AI_SHOT_NAMES)
assert.equal(R29_AI_SHOT_NAMES.length, 2)

const wide = shots.find((s) => s.name === 'r29-readonly-banner')
assert.ok(wide?.steps?.some((st) => st.op === 'aiReadonlyBanner'))
assert.ok(wide?.expect?.includes('ai-readonly-banner'))
assert.ok(wide?.expect?.includes('ai-prod-auto-banner'))
assert.equal(wide?.narrow, undefined)

const narrow = shots.find((s) => s.name === 'r29-readonly-banner-narrow')
assert.equal(narrow?.narrow, true)
assert.ok(narrow?.steps?.some((st) => st.op === 'aiReadonlyBanner'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiReadonlyBanner'"))
assert.ok(panel.includes("setScreenshotProtectionOverride('readonly')"))
assert.ok(panel.includes('data-testid="ai-readonly-banner"'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiReadonlyBanner'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r29.mjs'"))
assert.ok(har.includes('r29AiShots()'))

const css = norm('src/renderer/src/styles.css')
const start = css.indexOf('Round 29: read-only host calm banner')
assert.ok(start >= 0)
const block = css.slice(start, start + 700)
assert.ok(block.includes('.ai-readonly-banner'))
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R29 CSS')

const readme = norm('docs/screenshots/r29/README.md')
assert.ok(readme.includes('readonly'))
assert.ok(readme.includes('aiReadonlyBanner'))

console.log('test-r29-readonly-banner-shots: ok', R29_AI_SHOT_NAMES.length)
