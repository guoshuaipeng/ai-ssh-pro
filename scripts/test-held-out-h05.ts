/**
 * Held-out H05 — interruptible mid-stream + retry as new turn.
 * Loads tests/fixtures/held-out/h05-interrupt-retry.json.
 *
 * Do not tune product to the held-out set beyond the published suite contract.
 *
 * Run: npx tsx --tsconfig tsconfig.node.json scripts/test-held-out-h05.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { finalizeStoppedLines, isComposerReadyAfterStop } from '../src/shared/ai-stream-stop'
import {
  assistantText,
  isIsoComposerReady,
  isoUserText,
  replayIsoEvents,
  retryIsoTurn,
  turnHasCancelled,
  type IsoEvent
} from '../src/shared/ai-stream-isolation'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const norm = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T

type Expect = {
  t1Stopped?: boolean
  t1Cancelled?: boolean
  t1AssistantContains?: string
  t1AssistantNotContains?: string
  t1Streaming?: boolean
  t1AssistantCount?: number
  t2?: string
  t2User?: string
  t2Stopped?: boolean
  liveId?: string | null
  composerReady?: boolean
  busy?: boolean
  retryOk?: boolean
  retryReason?: string
}

type Scenario = {
  id: string
  events: IsoEvent[]
  retryAttempt?: { turn: string; from: string }
  expect: Expect
}

type H05Fix = {
  id: string
  scenarios: Scenario[]
  wiring: {
    panelMustInclude: string[]
    isoModuleExports: string[]
    stopMarksCancelled?: boolean
    retryStartsNewTurn?: boolean
  }
}

const fix = load<H05Fix>('tests/fixtures/held-out/h05-interrupt-retry.json')
assert.equal(fix.id, 'H05')

const isoSrc = norm('src/shared/ai-stream-isolation.ts')
for (const name of fix.wiring.isoModuleExports) {
  assert.ok(isoSrc.includes(`export function ${name}`), `iso export missing: ${name}`)
}

const stopSrc = norm('src/shared/ai-stream-stop.ts')
assert.ok(stopSrc.includes('cancelled?: boolean'), 'stream-stop must model cancelled')
assert.ok(stopSrc.includes('cancelled: true'), 'finalizeStoppedLines marks cancelled')

for (const sc of fix.scenarios) {
  const state = replayIsoEvents(sc.events)
  const exp = sc.expect

  if (sc.retryAttempt) {
    const r = retryIsoTurn(state, sc.retryAttempt.turn, sc.retryAttempt.from)
    if (exp.retryOk === false) {
      assert.equal(r.ok, false, `${sc.id} retry must fail`)
      if (!r.ok && exp.retryReason) assert.equal(r.reason, exp.retryReason, `${sc.id} reason`)
    } else {
      assert.equal(r.ok, true, `${sc.id} retry must succeed`)
    }
  }

  if (exp.t1Stopped != null) assert.equal(Boolean(state.turns.t1?.stopped), exp.t1Stopped, `${sc.id}.t1Stopped`)
  if (exp.t1Cancelled != null) assert.equal(turnHasCancelled(state.turns.t1), exp.t1Cancelled, `${sc.id}.t1Cancelled`)
  if (exp.t1AssistantContains) {
    assert.ok(assistantText(state.turns.t1).includes(exp.t1AssistantContains), `${sc.id} t1 contains`)
  }
  if (exp.t1AssistantNotContains) {
    assert.equal(
      assistantText(state.turns.t1).includes(exp.t1AssistantNotContains),
      false,
      `${sc.id} t1 must not contain`
    )
  }
  if (exp.t1Streaming === false) {
    const rows = state.turns.t1?.lines.filter((l) => l.role === 'assistant') ?? []
    assert.ok(rows.every((r) => !r.streaming), `${sc.id} no streaming after stop`)
  }
  if (exp.t1AssistantCount != null) {
    const n = state.turns.t1?.lines.filter((l) => l.role === 'assistant').length ?? 0
    assert.equal(n, exp.t1AssistantCount, `${sc.id}.t1AssistantCount`)
  }
  if (exp.t2 != null) assert.equal(assistantText(state.turns.t2), exp.t2, `${sc.id}.t2`)
  if (exp.t2User != null) assert.equal(isoUserText(state.turns.t2), exp.t2User, `${sc.id}.t2User`)
  if (exp.t2Stopped != null) assert.equal(Boolean(state.turns.t2?.stopped), exp.t2Stopped, `${sc.id}.t2Stopped`)
  if ('liveId' in exp) assert.equal(state.liveId, exp.liveId ?? null, `${sc.id}.liveId`)
  if (exp.busy != null) assert.equal(Boolean(state.busy), exp.busy, `${sc.id}.busy`)
  if (exp.composerReady != null) {
    assert.equal(isIsoComposerReady(state), exp.composerReady, `${sc.id}.composerReady`)
  }
}

// Unit: finalize marks cancelled; composer ready helper
{
  const mid = finalizeStoppedLines(
    [
      { role: 'user' as const, content: 'q' },
      { role: 'assistant' as const, content: 'hi', streaming: true }
    ],
    '已取消'
  )
  assert.equal(mid[1].cancelled, true)
  assert.equal(mid[1].streaming, false)
  assert.equal(isComposerReadyAfterStop(mid, false), true)
  assert.equal(isComposerReadyAfterStop(mid, true), false)
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
for (const s of fix.wiring.panelMustInclude) {
  assert.ok(panel.includes(s), `H05 panel wiring missing: ${s}`)
}
assert.ok(/cur\.stopped\s*=\s*true/.test(panel), 'stopGeneration must set cur.stopped = true')
assert.ok(panel.includes('if (turn.stopped) return'), 'applyTurn must ignore stopped turns')
assert.ok(panel.includes('void submitToAi(row.content)'), 'retry starts a new submitToAi turn')
assert.match(
  panel,
  /const retryLastUser = useCallback\(\(\) => \{\s*if \(busy\) \{\s*showToast\(tg\('ai\.busyWait'\)/
)

if (fix.wiring.stopMarksCancelled) {
  assert.ok(panel.includes('cancelled: true') || panel.includes('l.cancelled'), 'panel surfaces cancelled')
}
if (fix.wiring.retryStartsNewTurn) {
  assert.ok(panel.includes('data-testid="ai-cancelled-retry"'), 'cancelled card has Retry CTA')
  assert.ok(panel.includes('onClick={retryLastUser}'), 'cancelled Retry uses retryLastUser')
}

console.log(`test-held-out-h05: ok (${fix.scenarios.length} scenarios, stop+retry wiring)`)
