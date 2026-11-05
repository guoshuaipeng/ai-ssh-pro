/**
 * Held-out H06 — history isolation (new chat vs restore recall).
 * Loads tests/fixtures/held-out/h06-history-isolation.json.
 *
 * Do not tune product to the held-out set beyond the published suite contract.
 *
 * Run: npx tsx --tsconfig tsconfig.node.json scripts/test-held-out-h06.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyNewChat,
  applyRestore,
  buildRequestMessages,
  clearPromptFacts,
  emptyHistoryIso,
  memoryContains,
  requestContains,
  seedLive,
  type IsoChatMessage,
  type PromptMemory
} from '../src/shared/ai-history-isolation'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const norm = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T

type Expect = {
  liveEmpty?: boolean
  archiveCount?: number
  requestHasPoison?: boolean
  requestHasAsk?: boolean
  otherRequestHasPoison?: boolean
  afterClearHasPoison?: boolean
  afterClearKeepsNotes?: boolean
}

type Scenario = {
  id: string
  seed?: IsoChatMessage[]
  seedKey?: string
  otherKey?: string
  steps?: string[]
  promptMemory?: PromptMemory
  expect: Expect
}

type H06Fix = {
  id: string
  poison: string
  askRecall: string
  scenarios: Scenario[]
  wiring: {
    panelMustInclude: string[]
    clearRecordMustClearFacts: boolean
    agentSessionUsesThreadId: boolean
    isoModuleExports: string[]
  }
}

const fix = load<H06Fix>('tests/fixtures/held-out/h06-history-isolation.json')
assert.equal(fix.id, 'H06')

const isoSrc = norm('src/shared/ai-history-isolation.ts')
for (const name of fix.wiring.isoModuleExports) {
  assert.ok(isoSrc.includes(`export function ${name}`), `iso export missing: ${name}`)
}

const key = 'host-demo'
for (const sc of fix.scenarios) {
  if (sc.promptMemory) {
    const cleared = clearPromptFacts(sc.promptMemory, { keepNotes: true })
    if (sc.expect.afterClearHasPoison === false) {
      assert.equal(memoryContains(cleared, fix.poison), false, `${sc.id} prompt facts cleared`)
    }
    if (sc.expect.afterClearKeepsNotes) {
      assert.ok(cleared.notes.length > 0, `${sc.id} notes kept`)
    }
    continue
  }

  if (sc.steps?.includes('seedOtherEmpty') || sc.steps?.includes('askOnOther')) {
    const a = sc.seedKey || 'host-a'
    const b = sc.otherKey || 'host-b'
    let state = seedLive(emptyHistoryIso(), a, sc.seed || [])
    state = seedLive(state, b, [])
    const req = buildRequestMessages(state.live[b] || [], fix.askRecall)
    assert.equal(requestContains(req, fix.poison), false, `${sc.id} cross-key`)
    continue
  }

  let state = seedLive(emptyHistoryIso(), key, sc.seed || [])
  let archiveId = ''
  for (const step of sc.steps || []) {
    if (step === 'newChat') {
      state = applyNewChat(state, key, { id: 'arch-1', now: 1 })
      archiveId = state.archives[0]?.id || ''
    } else if (step === 'restore') {
      assert.ok(archiveId, `${sc.id} need archive to restore`)
      state = applyRestore(state, key, archiveId, { archiveCurrent: true, now: 2 })
    }
  }
  const live = state.live[key] || []
  if (sc.expect.liveEmpty != null) {
    assert.equal(live.length === 0, sc.expect.liveEmpty, `${sc.id} liveEmpty`)
  }
  if (sc.expect.archiveCount != null) {
    assert.equal(state.archives.length, sc.expect.archiveCount, `${sc.id} archiveCount`)
  }
  if (sc.steps?.includes('askRecall')) {
    const req = buildRequestMessages(live, fix.askRecall)
    if (sc.expect.requestHasAsk) {
      assert.ok(requestContains(req, fix.askRecall), `${sc.id} ask in request`)
    }
    if (sc.expect.requestHasPoison != null) {
      assert.equal(requestContains(req, fix.poison), sc.expect.requestHasPoison, `${sc.id} poison in request`)
    }
  }
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
for (const s of fix.wiring.panelMustInclude) {
  assert.ok(panel.includes(s), `H06 panel wiring missing: ${s}`)
}
// Request history must follow linesRef (post new-chat / restore), not a stale closure.
assert.ok(
  /const history: AiChatMessage\[] = \[[\s\S]*?linesRef\.current/.test(panel),
  'submitToAi history must read linesRef.current'
)

const clearSrc = norm('src/main/core-a-context.ts')
if (fix.wiring.clearRecordMustClearFacts) {
  assert.ok(/observations:\s*\[\]/.test(clearSrc), 'archiveAndClearRecord must clear observations')
  assert.ok(/recentCommands:\s*\[\]/.test(clearSrc), 'archiveAndClearRecord must clear recentCommands')
}

const agent = norm('src/main/ai-interactive-agent.ts')
if (fix.wiring.agentSessionUsesThreadId) {
  assert.ok(
    /getSessionState\(\s*threadId\s*\)/.test(agent),
    'getSessionState must use threadId (historyKey), not bare targetSessionId'
  )
  assert.ok(
    /persistSessionState\(\s*threadId\s*,/.test(agent),
    'persistSessionState must use threadId'
  )
}

console.log(`test-held-out-h06: ok (${fix.scenarios.length} scenarios)`)
