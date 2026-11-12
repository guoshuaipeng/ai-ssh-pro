const fs = require('fs');

// Fix unused import
let har = fs.readFileSync('scripts/screenshot-key-screens.mjs', 'utf8');
har = har.replace(
  `import { r14AiShots, R14_AI_SHOT_NAMES } from './ai-shot-matrix-r14.mjs'`,
  `import { r14AiShots } from './ai-shot-matrix-r14.mjs'`
);
fs.writeFileSync('scripts/screenshot-key-screens.mjs', har, 'utf8');

// CSS accents — Round 14 polish: clear left-accent hierarchy
let css = fs.readFileSync('src/renderer/src/styles.css', 'utf8');
if (!css.includes('R14 Round14: card left accents')) {
  const cancelledBlock = `.ai-panel .ai-card-cancelled {
  border-left: 2px solid var(--color-text-muted);
}`;
  if (!css.includes(cancelledBlock) && !css.includes('.ai-panel .ai-card-cancelled')) {
    throw new Error('cancelled block missing');
  }
  // Replace cancelled-only rule with full hierarchy block
  const neu = `/* R14 Round14: card left accents — streaming=accent, cancelled=muted, error=danger */
.ai-panel .msg.assistant.ai-card-streaming {
  border-left: 2px solid var(--color-accent);
}
.ai-panel .ai-card-cancelled {
  border-left: 2px solid var(--color-text-muted);
}
.ai-panel .msg.assistant.ai-card-error {
  border-left: 2px solid var(--color-danger);
}`;
  // Prefer replacing existing cancelled rule
  const re = /\.ai-panel \.ai-card-cancelled \{\r?\n  border-left: 2px solid var\(--color-text-muted\);\r?\n\}/;
  if (!re.test(css)) throw new Error('cancelled CSS rule not matched');
  css = css.replace(re, neu);
  fs.writeFileSync('src/renderer/src/styles.css', css, 'utf8');
  console.log('CSS accents patched');
} else {
  console.log('CSS already has R14 accents');
}

// Also soft-touch features.css streaming if it needs border-left? Keep styles.css as source of truth for panel.

// test-r14-ai-shot-harness.ts
fs.writeFileSync(
  'scripts/test-r14-ai-shot-harness.ts',
  `/** R14: declarative AI screenshot matrix + hook ops are wired. */
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
  assert.ok(hooks.includes('op: "' + op + '"') || hooks.includes("op: '" + op + "'") || hooks.includes('| { op: "' + op + '"'), op + ' typed')
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
`.replace(/\\n/g, '\n').replace(/\\r/g, '\r'),
  'utf8'
);

// Fix the test file - I messed up escaping. Rewrite cleanly.
fs.writeFileSync(
  'scripts/test-r14-ai-shot-harness.ts',
  [
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
    "  assert.ok(panel.includes(\\\"detail?.op === '\\\" + op + \\\"'\\\"), 'AIPanel handles ' + op)",
    '}',
    "assert.ok(panel.includes('screenshotProtectionOverride'), 'prod banner override')",
    "assert.ok(panel.includes('screenshotResumeLockRef'), 'D29 resume lock')",
    "assert.ok(panel.includes('protectionForUi'), 'protectionForUi')",
    '',
    "const app = norm('src/renderer/src/App.tsx')",
    "assert.ok(app.includes(\\\"detail.op === 'aiCancelled'\\\"), 'App opens panel for R14 ops')",
    "assert.ok(app.includes(\\\"detail.op === 'aiAccentStack'\\\"), 'App opens panel for accent stack')",
    '',
    "const har = norm('scripts/screenshot-key-screens.mjs')",
    "assert.ok(har.includes(\\\"from './ai-shot-matrix-r14.mjs'\\\"), 'harness imports matrix')",
    "assert.ok(har.includes('r14AiShots()'), 'harness injects matrix')",
    '',
    "console.log('test-r14-ai-shot-harness: ok', R14_AI_SHOT_NAMES.length)",
    ''
  ].join('\n'),
  'utf8'
);

console.log('test harness file written');
