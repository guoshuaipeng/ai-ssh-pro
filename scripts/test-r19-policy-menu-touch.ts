/** R19: composer policy menu touch / no-hover readability (R15 debt). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("tg(`policy.chip.${aiPolicy.effective}`"))
assert.ok(panel.includes('data-testid="ai-safety-chip-label"'))
assert.ok(panel.includes("safetyOpen ? ' is-open' : ''") || panel.includes('safetyOpen ? \' is-open\' : \'\''))
assert.ok(panel.includes('R19: keyboard/touch'))
assert.ok(panel.includes('[data-testid="ai-safety-option"].is-current'))
assert.ok(panel.includes('data-chip-short='))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R19 Round19: policy menu touch / no-hover'))
assert.ok(css.includes('.ai-composer-bar .ai-safety-chip.is-open'))
assert.ok(css.includes('min-height: 40px'))
assert.ok(css.includes('.ai-composer-bar .ai-safety-pop .ai-safety-link'))
assert.ok(css.includes('min-height: 32px'))
const start = css.indexOf('R19 Round19: policy menu touch / no-hover')
const end = css.indexOf('/* H02: suggest-only decision row', start)
assert.ok(start >= 0 && end > start)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(css.slice(start, end)), false, 'no token fallbacks in R19 policy CSS')

assert.equal(translate('zh-CN', 'policy.chip.ask'), '需确认')
assert.equal(translate('zh-CN', 'policy.chip.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.chip.auto'), '自动')
assert.equal(translate('en', 'policy.chip.ask'), 'Ask')
assert.equal(translate('en', 'policy.chip.suggest'), 'Suggest')
assert.equal(translate('en', 'policy.chip.auto'), 'Auto')
assert.equal(translate('zh-CN', 'policy.ask'), '执行前确认') // full name still in menu

// Menu still exposes full labels + hints (no mystery truncation in pop)
assert.ok(panel.includes("tg(`policy.${id}` as 'policy.ask')"))
assert.ok(panel.includes("tg(`policy.${id}Short`"))

console.log('test-r19-policy-menu-touch: ok')
