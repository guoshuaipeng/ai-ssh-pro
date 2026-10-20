import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'
import { resolveAiPolicy } from '../src/shared/ai-policy'

function i18nHas(k: string): boolean { return readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8').includes(`'${k}'`) }
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
const bar = panel.slice(panel.indexOf('data-testid="ai-composer-bar"'), panel.indexOf('className={`ai-chip ai-attach-chip'))

// 1) model chip is a themed menu, not a native select
assert.equal(bar.includes('<select'), false, 'composer chips use no native select')
assert.ok(bar.includes('data-testid="ai-model-menu"') && bar.includes('role="menuitemradio"'))
assert.ok(bar.includes('aria-checked={m === currentModel}'))
assert.ok(panel.includes('function menuKeyNav') && /ArrowDown[\s\S]*Home[\s\S]*End/.test(panel))
const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(css, /\.ai-chip-menu\s*\{[^}]*border-radius:\s*var\(--radius-popover\)[^}]*box-shadow:\s*var\(--shadow-menu\)/)

// 2) safety chip always opens; options explain the cap inline; links to host safety
assert.equal(bar.includes('name="lock"'), false)
assert.ok(bar.includes('data-testid="ai-safety-option"') && bar.includes('policyOptionCap(id)'))
assert.ok(bar.includes('data-testid="safety-open-host"'))
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('onOpenHostSafety={'))
// M25 scope change: production no longer caps; read-only still does.
const prod = resolveAiPolicy({ settings: { aiAutoHighRisk: true }, tempOverride: 'auto', protection: { level: 'production', elevated: false } })
assert.equal(prod.effective, 'auto')
assert.equal(prod.cappedBy, null)
assert.equal(prod.autoHighRisk, true)
const ro = resolveAiPolicy({ settings: {}, tempOverride: 'auto', protection: { level: 'readonly', elevated: false } })
assert.equal(ro.effective, 'suggest')
assert.equal(translate('zh-CN', 'policy.capMaxReadonly', { policy: translate('zh-CN', 'policy.suggest') }), '只读主机最高为「仅建议」')
assert.equal(i18nHas('policy.capProduction'), false)
import { aiWriteVerdict, capSafetyModeForProtection } from '../src/shared/ai-write-guard'
assert.deepEqual(aiWriteVerdict({ level: 'production' }, { approved: false, kind: 'write' }), { allow: true })
assert.deepEqual(aiWriteVerdict({ level: 'readonly' }, { approved: true, kind: 'write' }), { allow: false, reason: 'readonly' })
assert.equal(capSafetyModeForProtection('auto', { level: 'production' }, 'write'), 'auto')
const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
assert.equal(agent.includes('这台主机处于生产保护'), false)

// 3) names
assert.equal(translate('zh-CN', 'policy.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.ask'), '执行前确认')
assert.equal(translate('zh-CN', 'policy.auto'), '自动执行')
assert.equal(translate('en', 'policy.suggest'), 'Suggest only')
assert.equal(translate('en', 'policy.ask'), 'Confirm before run')
assert.equal(translate('en', 'policy.auto'), 'Auto run')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const old of ['只看不改', '改动前问我', '放手执行', 'Look only', 'Ask before changes', 'Hands-off']) assert.equal(i18n.includes(old), false, old)
console.log('test-m25-composer-menus ok')
