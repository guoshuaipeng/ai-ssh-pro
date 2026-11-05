/** R32: EN policy chip short labels + zh/en consistency (not CTA-like Confirm). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// Visible chip shorts — single words; EN Ask matches policy id (not Agree CTA "Confirm").
assert.equal(translate('zh-CN', 'policy.chip.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.chip.ask'), '需确认')
assert.equal(translate('zh-CN', 'policy.chip.auto'), '自动')
assert.equal(translate('en', 'policy.chip.suggest'), 'Suggest')
assert.equal(translate('en', 'policy.chip.ask'), 'Ask')
assert.equal(translate('en', 'policy.chip.auto'), 'Auto')

// Menu / settings keep full names
assert.equal(translate('zh-CN', 'policy.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.ask'), '执行前确认')
assert.equal(translate('zh-CN', 'policy.auto'), '自动执行')
assert.equal(translate('en', 'policy.suggest'), 'Suggest only')
assert.equal(translate('en', 'policy.ask'), 'Confirm before run')
assert.equal(translate('en', 'policy.auto'), 'Auto run')

// Short hints exist both locales
for (const k of ['policy.suggestShort', 'policy.askShort', 'policy.autoShort'] as const) {
  assert.ok(translate('zh-CN', k).length > 4, k)
  assert.ok(translate('en', k).length > 4, k)
}

// Chip must not equal Agree-like CTA wording in EN
assert.notEqual(translate('en', 'policy.chip.ask'), 'Confirm')
assert.notEqual(translate('en', 'policy.chip.ask'), translate('en', 'policy.ask'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("tg(`policy.chip.${aiPolicy.effective}`"))
assert.ok(panel.includes('data-testid="ai-safety-chip-label"'))
assert.ok(panel.includes('data-chip-short='))
// aria/title use full effective policy name via policyChipTitle
assert.ok(panel.includes('policyChipTitle'))
assert.ok(panel.includes("tg(`policy.${aiPolicy.effective}`"))

const i18n = norm('src/renderer/src/lib/i18n.tsx')
for (const k of ['policy.chip.suggest', 'policy.chip.ask', 'policy.chip.auto', 'policy.suggest', 'policy.ask', 'policy.auto']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}

console.log('test-r32-en-policy-chip: ok')
