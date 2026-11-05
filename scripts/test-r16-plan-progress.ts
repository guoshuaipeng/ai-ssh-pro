/** R16: multi-turn plan progress visibility (ask/suggest + active step). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("policy?: 'suggest' | 'ask' | 'auto'"))
assert.ok(panel.includes('// R16: ask/suggest/auto all show plan step n/max'))
assert.equal(/ev\.policy === 'auto'\s*\?\s*\{[\s\S]*?step: ev\.step/.test(panel), false, 'must not gate runProgress on auto-only')
assert.ok(panel.includes('data-policy={runProgress.policy || undefined}'))
assert.ok(panel.includes("runProgress.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')"))
assert.ok(panel.includes("runProgress.policy === 'auto' &&"))
assert.ok(panel.includes("isConfirmable ? ' is-active-plan-step' : ''"))
assert.ok(panel.includes("data-active-plan={isConfirmable ? '1' : undefined}"))
assert.ok(panel.includes('data-testid="ai-active-plan-step"'))
assert.ok(panel.includes("tg('ai.activePlanStep'"))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R16 Round16: active plan step highlight'))
assert.ok(css.includes('.ai-panel .ai-structured.is-active-plan-step'))
assert.ok(css.includes('.ai-panel .ai-active-plan-badge'))
const start = css.indexOf('R16 Round16: active plan step highlight')
const end = Math.max(css.indexOf('R15/R16: multi-step batch copy + fill', start), css.indexOf('R15 Round15: multi-step batch copy bar', start))
assert.ok(start >= 0 && end > start)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(css.slice(start, end)), false, 'no token fallbacks in R16 plan CSS')

assert.ok(translate('zh-CN', 'ai.planStepsTip').includes('规划进度'))
assert.equal(translate('zh-CN', 'ai.activePlanStep', { n: 2, max: 10 }), '当前第 2/10 步')
assert.equal(translate('en', 'ai.activePlanStep', { n: 2, max: 10 }), 'Active step 2/10')
assert.ok(norm('src/renderer/src/lib/i18n.tsx').includes("'ai.planStepsTip'"))
assert.ok(norm('src/renderer/src/lib/i18n.tsx').includes("'ai.activePlanStep'"))

console.log('test-r16-plan-progress: ok')
