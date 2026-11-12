const fs = require('fs');
const lines = [
  '/** R14: declarative AI screenshot matrix + hook ops are wired. */',
  "import assert from 'node:assert/strict'",
  "import { readFileSync } from 'node:fs'",
  "import { r14AiShots, R14_AI_SHOT_NAMES } from './ai-shot-matrix-r14.mjs'",
  '',
  "const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')",
  '',
  'const shots = r14AiShots()',
  'assert.deepEqual(',
  '  shots.map((s) => s.name),',
  '  R14_AI_SHOT_NAMES,',
  "  'matrix names stable'",
  ')',
  'for (const name of [',
  "  'r14-cancel-retry',",
  "  'r14-d29-resume',",
  "  'r14-busy',",
  "  'r14-prod-banner',",
  "  'r14-suggest-narrow',",
  "  'r14-accent-stack'",
  ']) {',
  '  assert.ok(shots.some((s) => s.name === name), name)',
  '}',
  "assert.ok(shots.find((s) => s.name === 'r14-suggest-narrow')?.narrow === true, 'suggest is narrow')",
  "assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0), 'steps present')",
  "assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.includes('querySelector')), 'expects are DOM checks')",
  '',
  "const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')",
  "for (const op of ['aiCancelled', 'aiEmptyResume', 'aiProdBanner', 'aiSuggestCard', 'aiError', 'aiAccentStack', 'aiStreaming']) {",
  "  assert.ok(hooks.includes(op), op + ' typed')",
  '}',
  '',
  "const panel = norm('src/renderer/src/components/AIPanel.tsx')",
  "for (const op of ['aiCancelled', 'aiEmptyResume', 'aiProdBanner', 'aiSuggestCard', 'aiError', 'aiAccentStack']) {",
  "  assert.ok(panel.includes(\"detail?.op === '\" + op + \"'\"), 'AIPanel handles ' + op)",
  '}',
  "assert.ok(panel.includes('screenshotProtectionOverride'), 'prod banner override')",
  "assert.ok(panel.includes('screenshotResumeLockRef'), 'D29 resume lock')",
  "assert.ok(panel.includes('protectionForUi'), 'protectionForUi')",
  '',
  "const app = norm('src/renderer/src/App.tsx')",
  "assert.ok(app.includes(\"detail.op === 'aiCancelled'\"), 'App opens panel for R14 ops')",
  "assert.ok(app.includes(\"detail.op === 'aiAccentStack'\"), 'App opens panel for accent stack')",
  '',
  "const har = norm('scripts/screenshot-key-screens.mjs')",
  "assert.ok(har.includes(\"from './ai-shot-matrix-r14.mjs'\"), 'harness imports matrix')",
  "assert.ok(har.includes('r14AiShots()'), 'harness injects matrix')",
  '',
  "console.log('test-r14-ai-shot-harness: ok', R14_AI_SHOT_NAMES.length)",
  ''
];
// The above still has escaped quotes in array strings because of how I'm writing them in this cjs.
// Write with String.raw / carefully:
const body = `/** R14: declarative AI screenshot matrix + hook ops are wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r14AiShots, R14_AI_SHOT_NAMES } from './ai-shot-matrix-r14.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

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
`;
fs.writeFileSync('scripts/test-r14-ai-shot-harness.ts', body.replace(/\n/g, '\r\n'), 'utf8');

const accent = `/** R14: streaming / cancelled / error left-accent hierarchy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/renderer/src/styles.css', 'utf8').replace(/\\r\\n/g, '\\n')
assert.ok(css.includes('R14 Round14: card left accents'), 'R14 accent marker')
const start = css.indexOf('R14 Round14: card left accents')
const end = css.indexOf('@container (max-width: 230px)', start)
const block = css.slice(start, end > start ? end : start + 500)
assert.ok(block.includes('.ai-panel .msg.assistant.ai-card-streaming'), 'streaming rule')
assert.ok(block.includes('border-left: 2px solid var(--color-accent)'), 'streaming accent')
assert.ok(block.includes('.ai-panel .ai-card-cancelled'), 'cancelled rule')
assert.ok(block.includes('border-left: 2px solid var(--color-text-muted)'), 'cancelled muted')
assert.ok(block.includes('.ai-panel .msg.assistant.ai-card-error'), 'error rule')
assert.ok(block.includes('border-left: 2px solid var(--color-danger)'), 'error danger')
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks in R14 accent block')

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('ai-card-streaming'), 'streaming class')
assert.ok(panel.includes('ai-card-cancelled'), 'cancelled class')
assert.ok(panel.includes('ai-card-error'), 'error class')
assert.ok(panel.includes('data-card="streaming"'), 'streaming data-card')
assert.ok(panel.includes('data-card="cancelled"'), 'cancelled data-card')
assert.ok(panel.includes('data-card="error"'), 'error data-card')

console.log('test-r14-card-accents: ok')
`;
fs.writeFileSync('scripts/test-r14-card-accents.ts', accent.replace(/\n/g, '\r\n'), 'utf8');
console.log('tests rewritten');
