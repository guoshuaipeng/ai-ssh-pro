/** H03: tab temp「自动执行」is real gated auto — not contradicted by confirmBypassAllowed=false. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { confirmBypassAllowed } from '../src/main/core-a-context'
import { policyTier, resolveAiPolicy } from '../src/shared/ai-policy'
import { planCommandConfirm } from '../src/shared/safety-tier'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// Legacy flag stays fail-closed; it is NOT the product auto-run switch.
assert.equal(confirmBypassAllowed(true), false)
assert.equal(confirmBypassAllowed(false), false)

// Tab override wins: global ask + temp auto → effective auto
const tabAuto = resolveAiPolicy({
  settings: { aiPolicy: 'ask' },
  hostPolicy: undefined,
  tempOverride: 'auto',
  protection: { level: 'normal' }
})
assert.equal(tabAuto.source, 'temp')
assert.equal(tabAuto.effective, 'auto')
assert.equal(tabAuto.chosen, 'auto')

const gate = (policy: 'ask' | 'auto', command: string, risk: string | null = 'medium') =>
  planCommandConfirm({
    tier: policyTier(policy),
    command,
    riskLevel: risk,
    allowHosts: [],
    production: false
  })

// date / read: auto-write under ask and auto (suggest also auto-reads — covered in H02)
for (const p of ['ask', 'auto'] as const) {
  const d = gate(p, 'date', 'low')
  assert.equal(d.kind, 'read', `date kind under ${p}`)
  assert.equal(d.mode, 'auto', `date mode under ${p}`)
  assert.equal(d.write, true, `date write under ${p}`)
  assert.equal(d.waitForAgree, false)
}

// medium write: ask confirms; tab auto writes without Agree
const touchAsk = gate('ask', 'touch /tmp/aiss-h03', 'medium')
assert.equal(touchAsk.mode, 'agree')
assert.equal(touchAsk.write, false)
assert.equal(touchAsk.waitForAgree, true)

const touchAuto = gate('auto', 'touch /tmp/aiss-h03', 'medium')
assert.equal(touchAuto.mode, 'auto')
assert.equal(touchAuto.write, true)
assert.equal(touchAuto.waitForAgree, false)
assert.equal(touchAuto.offerAgree, false)

// high still confirms under auto unless allowHighRisk
const rm = gate('auto', 'rm -rf /var/cache/*', 'high')
assert.equal(rm.mode, 'agree')
assert.equal(rm.write, false)

// Agent: tempPolicy from payload; auto skips HITL interrupt
const agent = norm('src/main/ai-interactive-agent.ts')
assert.ok(agent.includes('tempOverride: payload.safetyContext?.tempPolicy'))
assert.ok(agent.includes("if (needsInterrupt && safetyMode !== 'auto' && safetyMode !== 'suggest' && safetyMode !== 'hold')"))
assert.ok(agent.includes('confirmBypassAllowed(settings.autoApproveLowRisk)'))

const ctx = norm('src/main/core-a-context.ts')
assert.ok(ctx.includes('resolveAiPolicy + planCommandConfirm'))
assert.ok(ctx.includes('autoApproveLowRisk cannot skip HITL'))

// Honest empty / ladder copy (no confirm-always under auto)
const i18n = norm('src/renderer/src/lib/i18n.tsx')
assert.ok(i18n.includes("'ux64.emptyHintAuto':"))
assert.ok(i18n.includes("'ux64.emptyHintAsk':"))
assert.ok(i18n.includes("'ux64.emptyHintSuggest':"))
assert.ok(i18n.includes('当前为自动执行：中低风险会直接写入终端'))
assert.ok(i18n.includes('Auto run is on: low/medium risk writes'))
assert.equal(i18n.includes('建议的命令需经你确认后才会执行'), false, 'stale emptyHint zh')
assert.equal(i18n.includes('Suggested commands run only after you confirm.'), false, 'stale emptyHint en')
assert.ok(i18n.includes('高风险默认需确认（可在自动执行下单独开启）'))
assert.equal(i18n.includes('高风险操作始终需要确认'), false, 'stale ladder zh')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("aiPolicy.effective === 'auto'"))
assert.ok(panel.includes("'ux64.emptyHintAuto'"))
assert.ok(panel.includes('resolveAiPolicy + planCommandConfirm'))

const suite = norm('docs/ai-chat-test-suite.md')
assert.ok(suite.includes('resolveAiPolicy` + `planCommandConfirm'))
assert.equal(suite.includes('现协议：一律确认'), false, 'H03 must not claim always-confirm')

console.log('test-h03-tab-auto-policy: ok')
