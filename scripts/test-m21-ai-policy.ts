/** M21 (0.6.59): three AI policies, one resolver, migration of the old tiers. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AI_POLICIES,
  globalAiPolicy,
  hasLegacyHostPolicies,
  migrateAiPolicy,
  migrateLegacyHostPolicies,
  policyTier,
  resolveAiPolicy,
  stricterPolicy
} from '../src/shared/ai-policy'
import { planCommandConfirm } from '../src/shared/safety-tier'
import { changelogFor } from '../src/shared/changelog'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.deepEqual([...AI_POLICIES], ['suggest', 'ask', 'auto'])
// migration of the four old tiers
assert.equal(migrateAiPolicy('observe'), 'suggest')
assert.equal(migrateAiPolicy('confirm'), 'ask')
assert.equal(migrateAiPolicy('trusted'), 'auto')
assert.equal(migrateAiPolicy('autopilot'), 'auto')
assert.equal(migrateAiPolicy('bogus'), undefined)
assert.equal(globalAiPolicy({}), 'ask', 'default is ask')
assert.equal(globalAiPolicy({ safetyTier: 'observe' }), 'suggest')
assert.equal(globalAiPolicy({ aiPolicy: 'auto', safetyTier: 'observe' }), 'auto', 'aiPolicy wins over legacy')
assert.equal(stricterPolicy('auto', 'suggest'), 'suggest')
assert.equal(stricterPolicy(undefined, 'ask'), 'ask')

// resolver: temp > host > global; protection caps
let r = resolveAiPolicy({ settings: { aiPolicy: 'ask' } })
assert.deepEqual(r, { chosen: 'ask', effective: 'ask', source: 'global', cappedBy: null, autoHighRisk: false })
r = resolveAiPolicy({ settings: { aiPolicy: 'ask' }, hostPolicy: 'auto' })
assert.equal(r.source, 'host')
assert.equal(r.effective, 'auto')
r = resolveAiPolicy({ settings: { aiPolicy: 'ask' }, hostPolicy: 'auto', tempOverride: 'suggest' })
assert.equal(r.source, 'temp')
assert.equal(r.effective, 'suggest')
r = resolveAiPolicy({ settings: { aiPolicy: 'auto', aiAutoHighRisk: true }, protection: { level: 'production' } })
assert.equal(r.chosen, 'auto')
assert.equal(r.effective, 'ask', 'production never runs auto')
assert.equal(r.cappedBy, 'production')
assert.equal(r.autoHighRisk, false, 'auto-high-risk never on production')
r = resolveAiPolicy({ settings: { aiPolicy: 'auto', aiAutoHighRisk: true }, protection: { level: 'production', elevated: true } })
assert.equal(r.effective, 'auto', 'elevation window lifts the production cap')
r = resolveAiPolicy({ settings: { aiPolicy: 'ask' }, protection: { level: 'readonly' } })
assert.equal(r.effective, 'suggest')
assert.equal(r.cappedBy, 'readonly')
r = resolveAiPolicy({ settings: { aiPolicy: 'suggest' }, protection: { level: 'readonly' } })
assert.equal(r.cappedBy, null, 'no cap reason when already look-only')
r = resolveAiPolicy({ settings: { aiPolicy: 'auto', aiAutoHighRisk: true } })
assert.equal(r.autoHighRisk, true)

// the gate under each policy
const gate = (policy: 'suggest' | 'ask' | 'auto', command: string, extra: Partial<Parameters<typeof planCommandConfirm>[0]> = {}) =>
  planCommandConfirm({ tier: policyTier(policy), command, riskLevel: 'medium', allowHosts: [], ...extra }).mode
assert.equal(gate('suggest', 'df -h'), 'auto')
assert.equal(gate('suggest', 'systemctl restart nginx'), 'suggest')
assert.equal(gate('ask', 'systemctl restart nginx'), 'agree')
assert.equal(gate('ask', 'reboot'), 'strong')
assert.equal(gate('auto', 'systemctl restart nginx'), 'auto')
assert.equal(gate('auto', 'reboot'), 'agree', 'auto still asks for high risk')
assert.equal(gate('auto', 'reboot', { allowHighRisk: true }), 'auto')
assert.equal(gate('auto', 'reboot', { allowHighRisk: true, production: true }), 'strong', 'production falls back to ask')

// legacy host / session / allow-list → host profiles
const profiles = [
  { id: 'a', host: '10.0.0.1', label: 'web' },
  { id: 'b', host: '10.0.0.2', label: 'db' },
  { id: 'c', host: 'ci.local', label: 'ci' },
  { id: 'd', host: '10.0.0.4', label: 'kept', aiPolicy: 'ask' as const },
  { id: 'e', host: '10.0.0.5', label: 'sess-loose' }
]
const legacy = {
  safetyTierHosts: { a: 'trusted', d: 'observe' },
  safetyTierSessions: { a: 'observe', b: 'observe', e: 'autopilot' },
  autopilotAllowHosts: ['ci.local']
}
assert.equal(hasLegacyHostPolicies(legacy), true)
assert.equal(hasLegacyHostPolicies({ safetyTierHosts: {}, autopilotAllowHosts: [] }), false)
const moved = migrateLegacyHostPolicies(legacy, profiles, 'ask')
const by = Object.fromEntries(moved.profiles.map((p) => [p.id, (p as { aiPolicy?: string }).aiPolicy]))
assert.equal(by.a, 'suggest', 'stricter of host trusted + session observe')
assert.equal(by.b, 'suggest', 'session-only stricter than global moves over')
assert.equal(by.c, 'auto', 'allow-listed host → host auto')
assert.equal(by.d, 'ask', 'existing profile policy kept')
assert.equal(by.e, undefined, 'looser session-only override is dropped')
assert.equal(moved.changed, 3)

// wiring: every surface goes through resolveAiPolicy
const agent = norm('src/main/ai-interactive-agent.ts')
assert.ok(agent.includes('resolveAiPolicy({'), 'main process resolves the policy')
assert.ok(agent.includes('tier: policyTier(policy.effective)'))
assert.ok(agent.includes('allowHighRisk: policy.autoHighRisk'))
assert.ok(!agent.includes('effectiveSafetyTier('), 'old tier resolver gone from main')
const bar = norm('src/renderer/src/components/SafetyCommandBar.tsx')
assert.ok(bar.includes('resolveAiPolicy({') && !bar.includes('effectiveSafetyTier('))
const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('resolveAiPolicy({') && !panel.includes('safetyTierSessions'))
assert.ok(!panel.includes('data-testid="safety-session"'), 'session tier select removed')
const settingsUi = norm('src/renderer/src/components/SafetyTierSettings.tsx')
assert.ok(settingsUi.includes('AI_POLICIES.map') && settingsUi.includes('data-testid="ai-auto-high-risk"'))
assert.ok(settingsUi.includes('data-testid="ai-policy-overrides"'))
assert.ok(!settingsUi.includes('safety-allow-hosts'), 'allow-list textarea gone')
const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes('migrateLegacyHostPolicies(ai, state.profiles'))
assert.ok(app.includes("safetyTierHosts: {}, safetyTierSessions: {}, autopilotAllowHosts: []"))
const store = norm('src/main/app-store.ts')
assert.ok(store.includes('migrateAiPolicy(anyMerged.aiPolicy) ?? migrateAiPolicy(anyMerged.safetyTier)'))
assert.ok(store.includes('row.aiPolicy = aiPolicy'))
const i18n = norm('src/renderer/src/lib/i18n.tsx')
assert.ok(i18n.includes("'policy.suggest': '只看不改'") && i18n.includes("'policy.ask': '改动前问我'") && i18n.includes("'policy.auto': '放手执行'"))
assert.ok(!/三级|四档/.test(i18n), 'no 三级 / 四档 copy left')

const entries = changelogFor('0.6.59')
assert.ok(entries.length > 0)
console.log('test-m21-ai-policy: ok')
