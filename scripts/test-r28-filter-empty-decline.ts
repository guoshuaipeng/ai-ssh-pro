/** R28 polish: audit filter-empty matrix + pending Decline demotion. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r28AiShots, R28_AI_SHOT_NAMES } from './ai-shot-matrix-r28.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r28AiShots()
assert.deepEqual(shots.map((s) => s.name), R28_AI_SHOT_NAMES)
assert.equal(R28_AI_SHOT_NAMES.length, 4)

const fe = shots.find((s) => s.name === 'r28-audit-filter-empty')
assert.ok(fe?.steps?.some((st) => st.op === 'auditFilterEmpty' && st.query === 'zzz-r28-no-match'))
assert.ok(fe?.expect?.includes('audit-filter-empty'))
assert.ok(fe?.expect?.includes('audit-clear-filters'))
assert.ok(fe?.expect?.includes('audit-empty'))

const dec = shots.find((s) => s.name === 'r28-pending-decline-demoted')
assert.ok(dec?.steps?.some((st) => st.op === 'aiAskProgress'))
assert.ok(dec?.expect?.includes('ai-pending-decline'))
assert.ok(dec?.expect?.includes('ai-pending-agree'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('auditFilterEmpty'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'auditFilterEmpty'"))
assert.ok(app.includes('zzz-r28-no-match') || app.includes("d.query || 'zzz-r28-no-match'"))
assert.ok(app.includes('appendAudit({'))
assert.ok(app.includes('openAudit(hostKey'))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R28 Round28: demote pending Decline'))
const start = css.indexOf('R28 Round28: demote pending Decline')
const block = css.slice(start, start + 900)
assert.ok(block.includes('.ai-pending-confirm-actions .ai-btn-decline'))
assert.ok(block.includes('background: transparent'))
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R28 CSS')

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r28.mjs'"))
assert.ok(har.includes('r28AiShots()'))

const readme = norm('docs/screenshots/r28/README.md')
assert.ok(readme.includes('filter-empty'))
assert.ok(readme.includes('Decline'))

console.log('test-r28-filter-empty-decline: ok', R28_AI_SHOT_NAMES.length)
