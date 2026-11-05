/** R34 polish: failure pin + memory same-screen hierarchy quieter. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r34AiShots, R34_AI_SHOT_NAMES } from './ai-shot-matrix-r34.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.ok(R34_AI_SHOT_NAMES.includes('r34-failure-memory'))
assert.ok(R34_AI_SHOT_NAMES.includes('r34-failure-memory-narrow'))
assert.equal(R34_AI_SHOT_NAMES.length, 12)

const shots = r34AiShots()
const fail = shots.find((s) => s.name === 'r34-failure-memory')
const failN = shots.find((s) => s.name === 'r34-failure-memory-narrow')
assert.ok(fail?.steps?.some((st) => st.op === 'aiFailureEvidence' && (st as { withMemory?: boolean }).withMemory === true))
assert.ok(fail?.expect?.includes('opacity'))
assert.ok(fail?.expect?.includes('0.7'))
assert.equal(failN?.narrow, true)

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R34 Round34: quieter failure+memory hierarchy'))
const start = css.indexOf('R34 Round34: quieter failure+memory hierarchy')
const end = css.indexOf('R25 Round25: working-memory expand UX', start)
assert.ok(start >= 0 && end > start)
const block = css.slice(start, end)
assert.ok(block.includes('opacity: 0.58'))
assert.ok(block.includes("display: none"))
assert.ok(block.includes('max-width: 3.75rem'))
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks')

// R26 baseline still present; R34 wins on specificity+order for opacity
assert.ok(css.includes('R26 Round26: failure pin + memory chip hierarchy'))

const pkg = norm('package.json')
assert.ok(pkg.includes('test-r34-failure-memory-hierarchy'))

console.log('test-r34-failure-memory-hierarchy: ok')
