/**
 * Held-out H01 / H03 — load declarative fixtures under tests/fixtures/held-out/
 * and assert policy, gates, copy, and wiring. Do not tune product to these;
 * they encode the published suite expectations after main-set work.
 *
 * Run: npx tsx --tsconfig tsconfig.node.json scripts/test-held-out-h01-h03.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { confirmBypassAllowed } from '../src/main/core-a-context'
import { policyTier, resolveAiPolicy } from '../src/shared/ai-policy'
import { blockSilentHighRiskOnProd, prodAutoHint } from '../src/shared/prod-auto-hint'
import { planCommandConfirm } from '../src/shared/safety-tier'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const norm = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T

type HintCase = {
  id: string
  level?: 'normal' | 'production' | 'readonly'
  paused?: boolean
  policy?: Parameters<typeof resolveAiPolicy>[0]
  expectHint?: { source: string; autoHighRisk: boolean } | null
  block?: { level: 'normal' | 'production' | 'readonly'; kind: string; mode: string }
  expectBlock?: 'strong' | null
}

type H01Fix = {
  id: string
  cases: HintCase[]
  copyMustInclude: string[]
  copyMustNotInclude: string[]
  wiring: { appMustInclude: string[]; panelMustInclude: string[]; agentMustInclude: string[] }
}

type GateCase = {
  id: string
  policy?: Parameters<typeof resolveAiPolicy>[0]
  expect?: { source: string; effective: string; chosen: string }
  gate?: { policy: 'ask' | 'auto'; command: string; risk: string }
  expectGate?: Record<string, unknown>
}

type H03Fix = {
  id: string
  cases: GateCase[]
  legacy: { confirmBypassAllowedTrue: boolean; confirmBypassAllowedFalse: boolean }
  copyMustInclude: string[]
  copyMustNotInclude: string[]
}

const h01 = load<H01Fix>('tests/fixtures/held-out/h01-prod-policy.json')
assert.equal(h01.id, 'H01')

for (const c of h01.cases) {
  if (c.policy) {
    const policy = resolveAiPolicy(c.policy)
    const hint = prodAutoHint({
      level: c.level ?? 'normal',
      paused: Boolean(c.paused),
      policy
    })
    assert.deepEqual(hint, c.expectHint ?? null, c.id)
  }
  if (c.block) {
    const got = blockSilentHighRiskOnProd({
      level: c.block.level,
      kind: c.block.kind,
      mode: c.block.mode
    })
    assert.equal(got, c.expectBlock ?? null, c.id)
  }
}

const i18n = norm('src/renderer/src/lib/i18n.tsx')
for (const s of h01.copyMustInclude) assert.ok(i18n.includes(s), `H01 copy missing: ${s}`)
for (const s of h01.copyMustNotInclude) assert.equal(i18n.includes(s), false, `H01 stale copy: ${s}`)

const app = norm('src/renderer/src/App.tsx')
const panel = norm('src/renderer/src/components/AIPanel.tsx')
const agent = norm('src/main/ai-interactive-agent.ts')
for (const s of h01.wiring.appMustInclude) assert.ok(app.includes(s), `H01 app wiring: ${s}`)
for (const s of h01.wiring.panelMustInclude) assert.ok(panel.includes(s), `H01 panel wiring: ${s}`)
for (const s of h01.wiring.agentMustInclude) assert.ok(agent.includes(s), `H01 agent wiring: ${s}`)

const h03 = load<H03Fix>('tests/fixtures/held-out/h03-tab-auto.json')
assert.equal(h03.id, 'H03')
assert.equal(confirmBypassAllowed(true), h03.legacy.confirmBypassAllowedTrue)
assert.equal(confirmBypassAllowed(false), h03.legacy.confirmBypassAllowedFalse)

const gate = (policy: 'ask' | 'auto', command: string, risk: string | null) =>
  planCommandConfirm({
    tier: policyTier(policy),
    command,
    riskLevel: risk,
    allowHosts: [],
    production: false
  })

for (const c of h03.cases) {
  if (c.policy && c.expect) {
    const r = resolveAiPolicy(c.policy)
    assert.equal(r.source, c.expect.source, c.id)
    assert.equal(r.effective, c.expect.effective, c.id)
    assert.equal(r.chosen, c.expect.chosen, c.id)
  }
  if (c.gate && c.expectGate) {
    const d = gate(c.gate.policy, c.gate.command, c.gate.risk)
    for (const [k, v] of Object.entries(c.expectGate)) {
      assert.equal((d as Record<string, unknown>)[k], v, `${c.id}.${k}`)
    }
  }
}

for (const s of h03.copyMustInclude) assert.ok(i18n.includes(s), `H03 copy missing: ${s}`)
for (const s of h03.copyMustNotInclude) assert.equal(i18n.includes(s), false, `H03 stale copy: ${s}`)

console.log(`test-held-out-h01-h03: ok (H01 ${h01.cases.length} cases, H03 ${h03.cases.length} cases)`)
