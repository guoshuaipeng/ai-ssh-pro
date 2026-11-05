/** R34: ZH/EN policy chip contrast — shorts, band tint CSS, shot matrix, aiPolicy op. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'
import { r34AiShots, R34_AI_SHOT_NAMES } from './ai-shot-matrix-r34.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.deepEqual(
  R34_AI_SHOT_NAMES,
  [
    'r34-zh-ask',
    'r34-zh-suggest',
    'r34-zh-auto',
    'r34-en-ask',
    'r34-en-suggest',
    'r34-en-auto',
    'r34-zh-ask-narrow',
    'r34-en-suggest-narrow',
    'r34-zh-ask-pop',
    'r34-en-ask-pop'
  ]
)
assert.equal(R34_AI_SHOT_NAMES.length, 10)

assert.equal(translate('zh-CN', 'policy.chip.ask'), '需确认')
assert.equal(translate('zh-CN', 'policy.chip.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.chip.auto'), '自动')
assert.equal(translate('en', 'policy.chip.ask'), 'Ask')
assert.equal(translate('en', 'policy.chip.suggest'), 'Suggest')
assert.equal(translate('en', 'policy.chip.auto'), 'Auto')
assert.notEqual(translate('en', 'policy.chip.ask'), 'Confirm')
assert.notEqual(translate('en', 'policy.chip.ask'), translate('en', 'policy.ask'))

const shots = r34AiShots()
assert.equal(shots.length, 10)
const by = Object.fromEntries(shots.map((s) => [s.name, s]))
assert.ok(by['r34-zh-ask']?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'zh-CN'))
assert.ok(by['r34-zh-ask']?.steps?.some((st) => st.op === 'aiPolicy' && (st as { id?: string }).id === 'ask'))
assert.ok(by['r34-en-suggest']?.steps?.some((st) => st.op === 'aiPolicy' && (st as { id?: string }).id === 'suggest'))
assert.ok(by['r34-en-auto']?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'en'))
assert.ok(by['r34-zh-ask']?.expect?.includes('需确认'))
assert.ok(by['r34-en-ask']?.expect?.includes("'Ask'") || by['r34-en-ask']?.expect?.includes('"Ask"'))
assert.ok(by['r34-en-suggest']?.expect?.includes('Suggest'))
assert.ok(by['r34-zh-suggest']?.expect?.includes('仅建议'))
assert.equal(by['r34-zh-ask-narrow']?.narrow, true)
assert.equal(by['r34-en-suggest-narrow']?.narrow, true)
assert.ok(by['r34-zh-ask-pop']?.steps?.some((st) => st.op === 'aiComposerPop'))
assert.ok(by['r34-en-ask-pop']?.expect?.includes('ai-safety-pop') || by['r34-en-ask-pop']?.expect?.includes('Ask'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiPolicy'))
assert.ok(hooks.includes('"ask" | "suggest" | "auto"') || hooks.includes("'ask' | 'suggest' | 'auto'"))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiPolicy'"))
assert.ok(app.includes('setTempPolicyByTab'))
assert.ok(app.includes("raw === 'suggest' || raw === 'auto' || raw === 'ask'"))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R34 Round34: ZH/EN policy chip contrast'))
const start = css.indexOf('R34 Round34: ZH/EN policy chip contrast')
const end = css.indexOf('H02: suggest-only decision row', start)
assert.ok(start >= 0 && end > start)
const block = css.slice(start, end)
assert.ok(block.includes('safety-band-ok'))
assert.ok(block.includes('safety-band-warn'))
assert.ok(block.includes('safety-band-danger'))
assert.ok(block.includes('color-mix'))
assert.ok(block.includes('max-width: 5.75em'))
assert.ok(block.includes('max-width: 4.5em'))
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R34 CSS')

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r34.mjs'"))
assert.ok(har.includes('r34AiShots()'))

const pkg = norm('package.json')
assert.ok(pkg.includes('test-r34-zh-en-policy-chip-contrast'))

console.log('test-r34-zh-en-policy-chip-contrast: ok', R34_AI_SHOT_NAMES.length)
