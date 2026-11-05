/** R24 polish: failure→next uses short 「下一步 · n」 aligned with plan step. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'fail.nextConfirmStep', { n: 3 }), '下一步 · 3')
assert.equal(translate('en', 'fail.nextConfirmStep', { n: 3 }), 'Next · 3')
assert.ok(translate('zh-CN', 'fail.nextConfirm').includes('待确认'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("tg('fail.nextConfirmStep', { n: alignedPlan.step })"))
assert.ok(panel.includes('data-aligned-step={alignedPlan.step || undefined}'))
assert.equal(
  panel.includes("tg('fail.nextConfirm')}\n                        {alignedPlan.step ? ` · ${tg('ai.activePlanStep'"),
  false,
  'must not append full activePlanStep to nextConfirm'
)

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R24 Round24 polish: short failure→next step'))
const start = css.indexOf('R24 Round24 polish: short failure→next step')
const end = css.indexOf('/* R22 Round22:', start)
const block = css.slice(start, end > start ? end : start + 400)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks')

console.log('test-r24-next-confirm-short: ok')
