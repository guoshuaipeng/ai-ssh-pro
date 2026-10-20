import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prodAutoHint } from '../src/shared/prod-auto-hint'
import { resolveAiPolicy } from '../src/shared/ai-policy'

const pol = (o: Parameters<typeof resolveAiPolicy>[0]) => resolveAiPolicy(o)
// production + auto (any scope) → hint with its source
assert.deepEqual(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'production' } }) }), { source: 'global', autoHighRisk: false })
assert.deepEqual(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'ask' }, hostPolicy: 'auto', protection: { level: 'production' } }) }), { source: 'host', autoHighRisk: false })
assert.deepEqual(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'auto', aiAutoHighRisk: true }, tempOverride: 'auto', protection: { level: 'production' } }) }), { source: 'temp', autoHighRisk: true })
// live: switching the tab back to ask removes it
assert.equal(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'auto' }, tempOverride: 'ask', protection: { level: 'production' } }) }), null)
// not production / paused / read-only cap → no hint
assert.equal(prodAutoHint({ level: 'normal', paused: false, policy: pol({ settings: { aiPolicy: 'auto' } }) }), null)
assert.equal(prodAutoHint({ level: 'production', paused: true, policy: pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'production' } }) }), null)
assert.equal(prodAutoHint({ level: 'readonly', paused: false, policy: pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'readonly' } }) }), null)
// reminder only: production never caps the policy (M25)
assert.equal(pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'production' } }).effective, 'auto')

// wiring
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('const autoHint = prodAutoHint({'))
assert.ok(app.includes("tempOverride: activeTab.tabId ? tempPolicyByTab[activeTab.tabId] : undefined"))
assert.ok(app.includes("window.addEventListener('aiss-ai-settings-saved', refresh)"))
assert.ok(app.includes('data-testid="banner-ai-auto"'))
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('window.addEventListener(OPEN_AI_POLICY_EVENT, onOpenPolicy)'))
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['prodAuto.chip', 'prodAuto.chipHigh', 'prodAuto.chipShort', 'prodAuto.tip', 'prodAuto.high', 'prodAuto.highOff']) assert.equal(i18n.split(`'${k}':`).length - 1, 2, k)
console.log('test-prod-auto-hint: ok')
