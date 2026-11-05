/**
 * Held-out H04 — rapid multi-turn / no stream mix-up.
 * Loads tests/fixtures/held-out/h04-rapid-stream.json and asserts isolation
 * via src/shared/ai-stream-isolation.ts + AIPanel Stop wiring.
 *
 * Do not tune product to the held-out set beyond the published suite contract.
 *
 * Run: npx tsx --tsconfig tsconfig.node.json scripts/test-held-out-h04.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assistantText,
  isLiveIsoTurn,
  liveAssistantText,
  replayIsoEvents,
  type IsoEvent
} from '../src/shared/ai-stream-isolation'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const norm = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T

type LiveSnap = {
  afterEvent: number
  expectContains?: string
  expectEquals?: string
  expectNotContains?: string
}

type Scenario = {
  id: string
  events: IsoEvent[]
  allowOffLive?: boolean
  liveSnapshots?: LiveSnap[]
  expect: {
    t1?: string
    t2?: string
    t3?: string
    liveId?: string | null
    t1AssistantContains?: string
    t1AssistantNotContains?: string
    t1Stopped?: boolean
    t1Streaming?: boolean
    liveNeverHad?: string
  }
}

type H04Fix = {
  id: string
  scenarios: Scenario[]
  wiring: {
    panelMustInclude: string[]
    isoModuleExports: string[]
    stopMustSetStopped?: boolean
  }
}

const fix = load<H04Fix>('tests/fixtures/held-out/h04-rapid-stream.json')
assert.equal(fix.id, 'H04')

const isoSrc = norm('src/shared/ai-stream-isolation.ts')
for (const name of fix.wiring.isoModuleExports) {
  assert.ok(isoSrc.includes(`export function ${name}`), `iso export missing: ${name}`)
}

for (const sc of fix.scenarios) {
  if (sc.liveSnapshots?.length) {
    let state = replayIsoEvents([], { allowOffLive: sc.allowOffLive })
    for (let i = 0; i < sc.events.length; i++) {
      state = replayIsoEvents(sc.events.slice(0, i + 1), { allowOffLive: sc.allowOffLive })
      const snap = sc.liveSnapshots.find((s) => s.afterEvent === i)
      if (!snap) continue
      const live = liveAssistantText(state)
      if (snap.expectContains != null) {
        assert.ok(live.includes(snap.expectContains), `${sc.id} after ${i}: live missing ${snap.expectContains}`)
      }
      if (snap.expectEquals != null) {
        assert.equal(live, snap.expectEquals, `${sc.id} after ${i}: live equals`)
      }
      if (snap.expectNotContains != null) {
        assert.equal(live.includes(snap.expectNotContains), false, `${sc.id} after ${i}: live has ${snap.expectNotContains}`)
      }
    }
  }

  const state = replayIsoEvents(sc.events, { allowOffLive: sc.allowOffLive })
  const exp = sc.expect
  if (exp.t1 != null) assert.equal(assistantText(state.turns.t1), exp.t1, `${sc.id}.t1`)
  if (exp.t2 != null) assert.equal(assistantText(state.turns.t2), exp.t2, `${sc.id}.t2`)
  if (exp.t3 != null) assert.equal(assistantText(state.turns.t3), exp.t3, `${sc.id}.t3`)
  if ('liveId' in exp) assert.equal(state.liveId, exp.liveId ?? null, `${sc.id}.liveId`)
  if (exp.t1AssistantContains) {
    assert.ok(assistantText(state.turns.t1).includes(exp.t1AssistantContains), `${sc.id} t1 contains`)
  }
  if (exp.t1AssistantNotContains) {
    assert.equal(
      assistantText(state.turns.t1).includes(exp.t1AssistantNotContains),
      false,
      `${sc.id} t1 must not contain late text`
    )
  }
  if (exp.t1Stopped != null) assert.equal(Boolean(state.turns.t1?.stopped), exp.t1Stopped, `${sc.id}.stopped`)
  if (exp.t1Streaming === false) {
    const rows = state.turns.t1?.lines.filter((l) => l.role === 'assistant') ?? []
    assert.ok(rows.every((r) => !r.streaming), `${sc.id} no streaming after stop`)
  }
  if (exp.liveNeverHad) {
    // Final live is empty/null; also ensure no turn that is live ever held the poison string mid-way
    // (covered by liveSnapshots when present).
    assert.equal(liveAssistantText(state).includes(exp.liveNeverHad), false)
  }
}

// Unit: superseded turn is not live
{
  const state = replayIsoEvents([
    { op: 'begin', turn: 'a', user: 'q1' },
    { op: 'begin', turn: 'b', user: 'q2' }
  ])
  assert.equal(isLiveIsoTurn(state, 'a'), false)
  assert.equal(isLiveIsoTurn(state, 'b'), true)
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
for (const s of fix.wiring.panelMustInclude) {
  assert.ok(panel.includes(s), `H04 panel wiring missing: ${s}`)
}
if (fix.wiring.stopMustSetStopped) {
  assert.ok(/cur\.stopped\s*=\s*true/.test(panel), 'stopGeneration must set cur.stopped = true')
  assert.ok(panel.includes('if (turn.stopped) return'), 'applyTurn must ignore stopped turns')
}

// send blocked while busy; stop then new submit is a new turn (suite contract)
assert.ok(panel.includes('if (!text || busy) return'), 'composer send must not queue while busy')
assert.ok(panel.includes('void submitToAi(row.content)'), 'retry starts a new submitToAi turn')

console.log(
  `test-held-out-h04: ok (${fix.scenarios.length} scenarios, isolation + Stop wiring)`
)
