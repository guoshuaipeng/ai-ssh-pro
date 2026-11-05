/** R14: declarative AI screenshot matrix + hook ops are wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r14AiShots, R14_AI_SHOT_NAMES } from './ai-shot-matrix-r14.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r14AiShots()
assert.deepEqual(
  shots.map((s) => s.name),
  R14_AI_SHOT_NAMES,
  'matrix names stable'
)
for (const name of [
  'r14-cancel-retry',
  'r14-d29-resume',
  'r14-busy',
  'r14-prod-banner',
  'r14-suggest-narrow',
  'r14-accent-stack'
]) {
  assert.ok(shots.some((s) => s.name === name), name)
}
assert.ok(shots.find((s) => s.name === 'r14-suggest-narrow')?.narrow === true, 'suggest is narrow')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0), 'steps present')
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.includes('querySelector')), 'expects are DOM checks')

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
for (const op of ['aiCancelled', 'aiEmptyResume', 'aiProdBanner', 'aiSuggestCard', 'aiError', 'aiAccentStack', 'aiStreaming']) {
  assert.ok(hooks.includes(op), op + ' typed')
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
for (const op of ['aiCancelled', 'aiEmptyResume', 'aiProdBanner', 'aiSuggestCard', 'aiError', 'aiAccentStack']) {
  assert.ok(panel.includes("detail?.op === '" + op + "'"), 'AIPanel handles ' + op)
}
assert.ok(panel.includes('screenshotProtectionOverride'), 'prod banner override')
assert.ok(panel.includes('screenshotResumeLockRef'), 'D29 resume lock')
assert.ok(panel.includes('protectionForUi'), 'protectionForUi')

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiCancelled'"), 'App opens panel for R14 ops')
assert.ok(app.includes("detail.op === 'aiAccentStack'"), 'App opens panel for accent stack')

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r14.mjs'"), 'harness imports matrix')
assert.ok(har.includes('r14AiShots()'), 'harness injects matrix')

console.log('test-r14-ai-shot-harness: ok', R14_AI_SHOT_NAMES.length)
