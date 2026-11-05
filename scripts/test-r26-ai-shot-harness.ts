/** R26: memory expand open/collapse/jump-audit screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r26AiShots, R26_AI_SHOT_NAMES } from './ai-shot-matrix-r26.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r26AiShots()
assert.deepEqual(shots.map((s) => s.name), R26_AI_SHOT_NAMES, 'matrix names stable')
assert.equal(R26_AI_SHOT_NAMES.length, 6)
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const opened = shots.find((s) => s.name === 'r26-memory-open')
assert.ok(opened)
assert.notEqual(opened?.narrow, true)
assert.ok(opened?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.open === true))
assert.ok(opened?.expect?.includes('ai-memory-pop'))
assert.ok(opened?.expect?.includes('ai-memory-close'))
assert.ok(opened?.expect?.includes('ai-memory-jump-btn'))

const openedN = shots.find((s) => s.name === 'r26-memory-open-narrow')
assert.equal(openedN?.narrow, true)

const collapsed = shots.find((s) => s.name === 'r26-memory-collapsed')
assert.ok(collapsed?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.open === false))
assert.ok(collapsed?.expect?.includes("aria-expanded") && collapsed?.expect?.includes("false"))
assert.ok(collapsed?.expect?.includes('ai-memory-pop'))
assert.ok(collapsed?.expect?.includes('ai-memory-count'))

const collapsedN = shots.find((s) => s.name === 'r26-memory-collapsed-narrow')
assert.equal(collapsedN?.narrow, true)

const jump = shots.find((s) => s.name === 'r26-memory-jump-audit')
assert.ok(jump?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.jumpAudit === true))
assert.ok(jump?.expect?.includes('audit-log'))
assert.ok(jump?.expect?.includes('au2-search'))
assert.ok(jump?.expect?.includes('systemctl'))

const jumpN = shots.find((s) => s.name === 'r26-memory-jump-audit-narrow')
assert.equal(jumpN?.narrow, true)
assert.ok(jumpN?.expect?.includes('audit-log'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('jumpAudit?: boolean'))
assert.ok(hooks.includes('open?: boolean'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiMemoryEvidence'"))
assert.ok(panel.includes('jumpAudit === true') || panel.includes('d.jumpAudit === true'))
assert.ok(panel.includes('OPEN_AUDIT_EVENT'))
assert.ok(panel.includes('wantOpen'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r26.mjs'"))
assert.ok(har.includes('r26AiShots()'))

const readme = norm('docs/screenshots/r26/README.md')
assert.ok(readme.includes('memory-open'))
assert.ok(readme.includes('memory-collapsed'))
assert.ok(readme.includes('memory-jump-audit'))

console.log('test-r26-ai-shot-harness: ok', R26_AI_SHOT_NAMES.length)
