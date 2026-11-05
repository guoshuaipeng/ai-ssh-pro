/** R27 polish: jumpAudit seeds matching audit row; matrix expects hit not empty. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r27AiShots, R27_AI_SHOT_NAMES } from './ai-shot-matrix-r27.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r27AiShots()
assert.deepEqual(shots.map((s) => s.name), R27_AI_SHOT_NAMES)
assert.equal(R27_AI_SHOT_NAMES.length, 4)

const hit = shots.find((s) => s.name === 'r27-jump-audit-hit')
assert.ok(hit)
assert.ok(hit?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.jumpAudit === true && st.seedAudit === true))
assert.ok(hit?.expect?.includes('audit-table'))
assert.ok(hit?.expect?.includes('audit-empty'))
assert.ok(hit?.expect?.includes('audit-filter-empty'))
assert.ok(hit?.expect?.includes('systemctl'))

const hitN = shots.find((s) => s.name === 'r27-jump-audit-hit-narrow')
assert.equal(hitN?.narrow, true)

const fail = shots.find((s) => s.name === 'r27-failure-memory')
assert.ok(fail?.steps?.some((st) => st.op === 'aiFailureEvidence' && st.withMemory === true))
assert.ok(fail?.expect?.includes('ai-failure-evidence'))
assert.ok(fail?.expect?.includes('ai-memory-chip'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('Round 27: seed a matching audit row'))
assert.ok(panel.includes('seedAudit'))
assert.ok(panel.includes("appendAudit({"))
assert.ok(panel.includes("aiss-audit-changed"))
assert.ok(panel.includes('demo: true'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('seedAudit?: boolean'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r27.mjs'"))
assert.ok(har.includes('r27AiShots()'))

const readme = norm('docs/screenshots/r27/README.md')
assert.ok(readme.includes('jump-audit-hit'))
assert.ok(readme.includes('failure-memory'))
assert.ok(readme.includes('seedAudit'))

console.log('test-r27-seed-jump-audit: ok', R27_AI_SHOT_NAMES.length)
