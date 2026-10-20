/** M22 (0.6.60): host 安全 card + AI chip shows the effective policy, cap reason and a per-tab temp override. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveAiPolicy } from '../src/shared/ai-policy'
import { changelogFor } from '../src/shared/changelog'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// temp override wins, but protection still caps it
let r = resolveAiPolicy({ settings: { aiPolicy: 'ask' }, hostPolicy: 'suggest', tempOverride: 'auto' })
assert.equal(r.source, 'temp')
assert.equal(r.effective, 'auto')
r = resolveAiPolicy({ settings: { aiPolicy: 'ask' }, tempOverride: 'auto', protection: { level: 'production' } })
assert.equal(r.source, 'temp')
assert.equal(r.chosen, 'auto')
assert.equal(r.effective, 'auto', 'M25: no production cap')
assert.equal(r.cappedBy, null)

// host card
const card = norm('src/renderer/src/components/HostSafetyCard.tsx')
assert.ok(card.includes('data-testid="host-safety-card"'))
assert.ok(card.includes('<ProtectionLevelField'), 'protection level lives on the card')
assert.ok(card.includes('data-testid="host-ai-policy"') && card.includes("tg('policy.followGlobal'"), 'follow global + 3 policies')
assert.ok(card.includes('AI_POLICIES.map'))
assert.ok(card.includes('data-testid="host-ai-effective"') && card.includes('resolveAiPolicy({'))
assert.ok(card.includes('policyCapNote(resolved.cappedBy)'))
const modal = norm('src/renderer/src/components/HostInventoryModal.tsx')
assert.ok(modal.includes('<HostSafetyCard'))
const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes('onAiPolicyChange={'))
assert.ok(app.includes('setHostAiPolicy(inventoryLink.profileId!, policy)'))

// AI chip: effective + cap + temp + source
const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('tempOverride: tempPolicy'))
assert.ok(panel.includes('data-source={aiPolicy.source}') && panel.includes('data-capped={aiPolicy.cappedBy'))
assert.ok(panel.includes('data-testid="safety-temp"'))
assert.ok(panel.includes('data-testid="ai-policy-effective"'))
assert.ok(panel.includes('data-testid="ai-policy-source"'))
assert.ok(panel.includes('...(tempPolicy ? { tempPolicy } : {})'), 'main process sees the temp override')
assert.ok(panel.includes('tempPolicy={tempPolicy}'), 'command bar resolves with the temp override')
// temp override is memory-only, per tab, dropped on close / disconnect
assert.ok(app.includes('useState<Record<string, AiPolicy>>({})'))
assert.ok(app.includes("tabs.some((t) => t.tabId === id && t.status === 'connected')"))
assert.ok(!/tempPolicyByTab[^\n]*(localStorage|setSettings|sessions\.save)/.test(app), 'temp override never persisted')
const ipc = norm('src/shared/ipc.ts')
assert.ok(ipc.includes("tempPolicy?: 'suggest' | 'ask' | 'auto'"))

const zh = norm('src/renderer/src/lib/i18n.tsx')
assert.ok(zh.includes("'policy.effective': '实际生效：{policy}'"))
assert.ok(zh.includes("'policy.capReadonly': '（受只读保护限制）'"))
assert.equal(zh.includes('受生产保护限制'), false)

assert.ok(changelogFor('0.6.60').length > 0)
console.log('test-m22-host-safety: ok')
