/**
 * Held-out H02 / H07 — declarative fixtures aligning unit tests
 * test-h02-suggest-only / test-h07-suggestion-steps.
 * Do not tune product to the held-out set beyond the published suite contract.
 *
 * Run: npx tsx --tsconfig tsconfig.node.json scripts/test-held-out-h02-h07.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { policyTier, resolveAiPolicy } from '../src/shared/ai-policy'
import { planCommandConfirm } from '../src/shared/safety-tier'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const norm = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T

type GateExpect = {
  mode?: string
  write?: boolean
  offerAgree?: boolean
  waitForAgree?: boolean
  kind?: string
}

type H02Fix = {
  id: string
  policy: { settings: { aiPolicy: string }; expect: { effective: string; tier: string } }
  gates: Array<{ id: string; command: string; risk: string | null; expect: GateExpect }>
  wiring: {
    agentMustInclude: string[]
    barMustInclude: string[]
    panelMustInclude: string[]
    copyMustInclude: string[]
    suggestUiForbid: string[]
  }
}

type H07Fix = {
  id: string
  minStepIndexMarks: number
  wiring: {
    panelMustInclude: string[]
    cssMustInclude: string[]
    copyMustInclude: string[]
    sharedMustInclude?: string[]
  }
}

const h02 = load<H02Fix>('tests/fixtures/held-out/h02-suggest-only.json')
assert.equal(h02.id, 'H02')

const resolved = resolveAiPolicy({ settings: { aiPolicy: 'suggest' } })
assert.equal(resolved.effective, h02.policy.expect.effective)
assert.equal(policyTier(resolved.effective), h02.policy.expect.tier)

const gate = (command: string, riskLevel: string | null) =>
  planCommandConfirm({
    tier: policyTier('suggest'),
    command,
    riskLevel,
    allowHosts: [],
    production: false
  })

for (const c of h02.gates) {
  const d = gate(c.command, c.risk)
  for (const [k, v] of Object.entries(c.expect)) {
    assert.equal((d as Record<string, unknown>)[k], v, `${c.id}.${k}`)
  }
}

const agent = norm('src/main/ai-interactive-agent.ts')
const bar = norm('src/renderer/src/components/SafetyCommandBar.tsx')
const panel = norm('src/renderer/src/components/AIPanel.tsx')
const i18n = norm('src/renderer/src/lib/i18n.tsx')
const css = norm('src/renderer/src/styles.css')

for (const s of h02.wiring.agentMustInclude) assert.ok(agent.includes(s), `H02 agent: ${s}`)
for (const s of h02.wiring.barMustInclude) assert.ok(bar.includes(s), `H02 bar: ${s}`)
for (const s of h02.wiring.panelMustInclude) assert.ok(panel.includes(s), `H02 panel: ${s}`)
for (const s of h02.wiring.copyMustInclude) assert.ok(i18n.includes(s), `H02 copy: ${s}`)

const suggestBlock = bar.slice(bar.indexOf("if (mode === 'suggest')"), bar.indexOf("if (mode === 'hold'"))
for (const s of h02.wiring.suggestUiForbid) {
  assert.equal(suggestBlock.includes(s), false, `H02 suggest UI must not include ${s}`)
}
assert.equal(i18n.split("'safety.suggestCopy':").length - 1, 2)
assert.equal(i18n.split("'safety.suggestFill':").length - 1, 2)

const h07 = load<H07Fix>('tests/fixtures/held-out/h07-suggestion-steps.json')
assert.equal(h07.id, 'H07')
for (const s of h07.wiring.panelMustInclude) assert.ok(panel.includes(s), `H07 panel: ${s}`)
for (const s of h07.wiring.cssMustInclude) assert.ok(css.includes(s), `H07 css: ${s}`)
for (const s of h07.wiring.copyMustInclude) assert.ok(i18n.includes(s), `H07 copy: ${s}`)
const sharedSteps = norm('src/shared/ai-suggestion-steps.ts')
for (const s of h07.wiring.sharedMustInclude || []) assert.ok(sharedSteps.includes(s), `H07 shared: ${s}`)
assert.equal(
  (panel.match(/data-testid="ai-step-index"/g) || []).length >= h07.minStepIndexMarks,
  true,
  'H07 step index marks'
)
assert.equal(i18n.split("'ai.stepIndex':").length - 1, 2)

console.log(`test-held-out-h02-h07: ok (H02 ${h02.gates.length} gates, H07 wiring)`)
