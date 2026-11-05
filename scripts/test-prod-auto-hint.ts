import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blockSilentHighRiskOnProd, prodAutoHint } from '../src/shared/prod-auto-hint'
import { resolveAiPolicy } from '../src/shared/ai-policy'

const pol = (o: Parameters<typeof resolveAiPolicy>[0]) => resolveAiPolicy(o)
// production + auto (any scope) → hint with its source
assert.deepEqual(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'production' } }) }), { source: 'global', autoHighRisk: false })
assert.deepEqual(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'ask' }, hostPolicy: 'auto', protection: { level: 'production' } }) }), { source: 'host', autoHighRisk: false })
// H01: even with aiAutoHighRisk, production banner never claims silent high
assert.deepEqual(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'auto', aiAutoHighRisk: true }, tempOverride: 'auto', protection: { level: 'production' } }) }), { source: 'temp', autoHighRisk: false })
// live: switching the tab back to ask removes it
assert.equal(prodAutoHint({ level: 'production', paused: false, policy: pol({ settings: { aiPolicy: 'auto' }, tempOverride: 'ask', protection: { level: 'production' } }) }), null)
// not production / paused / read-only cap → no hint
assert.equal(prodAutoHint({ level: 'normal', paused: false, policy: pol({ settings: { aiPolicy: 'auto' } }) }), null)
assert.equal(prodAutoHint({ level: 'production', paused: true, policy: pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'production' } }) }), null)
assert.equal(prodAutoHint({ level: 'readonly', paused: false, policy: pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'readonly' } }) }), null)
// reminder only: production never caps the policy (M25)
assert.equal(pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'production' } }).effective, 'auto')


// H01: high-risk never silent auto on production
assert.equal(blockSilentHighRiskOnProd({ level: 'production', kind: 'high', mode: 'auto' }), 'strong')
assert.equal(blockSilentHighRiskOnProd({ level: 'production', kind: 'write', mode: 'auto' }), null)
assert.equal(blockSilentHighRiskOnProd({ level: 'production', kind: 'high', mode: 'agree' }), null)
assert.equal(blockSilentHighRiskOnProd({ level: 'normal', kind: 'high', mode: 'auto' }), null)
assert.equal(blockSilentHighRiskOnProd({ level: 'readonly', kind: 'high', mode: 'auto' }), null)

// wiring
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('const autoHint = prodAutoHint({'))
assert.ok(app.includes("tempOverride: activeTab.tabId ? tempPolicyByTab[activeTab.tabId] : undefined"))
assert.ok(app.includes("window.addEventListener('aiss-ai-settings-saved', refresh)"))
assert.ok(app.includes('data-testid="banner-ai-auto"'))
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('window.addEventListener(OPEN_AI_POLICY_EVENT, onOpenPolicy)'))

assert.ok(panel.includes('prodAutoHint({'))
assert.ok(panel.includes('data-testid="ai-prod-auto-banner"'))
assert.ok(panel.includes("tg('prodAuto.panelHint')"))
const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
assert.ok(agent.includes('blockSilentHighRiskOnProd'))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['prodAuto.chip', 'prodAuto.chipHigh', 'prodAuto.chipShort', 'prodAuto.tip', 'prodAuto.high', 'prodAuto.highOff', 'prodAuto.panelHint']) assert.equal(i18n.split(`'${k}':`).length - 1, 2, k)

// 2.4 wrap-up: settings copy must not claim silent high on production
assert.ok(i18n.includes('非生产主机上的高风险也可自动执行'))
assert.ok(i18n.includes('生产主机仍强制确认高风险'))
assert.ok(i18n.includes('non-production hosts'))
assert.ok(i18n.includes('production hosts still require high-risk confirmation'))
assert.equal(i18n.includes('开启后对生产主机同样生效'), false, 'stale autoHighRiskHint zh')
assert.equal(i18n.includes('Applies to production hosts too; never on read-only hosts.'), false, 'stale autoHighRiskHint en')
assert.ok(i18n.includes('高风险命令仍需确认（不会静默执行）'))
assert.ok(i18n.includes('high-risk commands still ask first (never silent)'))
assert.ok(i18n.includes('中低风险可自动，高危仍需确认'))
assert.ok(i18n.includes('mid/low may auto; high-risk still confirms'))
// tip templates no longer take {high} on production (H01 honesty)
assert.equal(/'prodAuto\.tip':[^\n]*\{high\}/.test(i18n), false, 'prodAuto.tip must not interpolate {high}')
assert.ok(panel.includes("protection === 'production'"))
assert.ok(panel.includes('elevated && protection ==='))
assert.equal(panel.includes("level: production ? 'production' : 'normal'"), false, 'panel must not use flattened production prop for banner')
assert.equal(panel.includes('paused: false'), false, 'panel must pass elevate pause into prodAutoHint')

console.log('test-prod-auto-hint: ok')
