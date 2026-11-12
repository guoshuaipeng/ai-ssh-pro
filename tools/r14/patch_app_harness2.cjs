const fs = require('fs');
const appPath = 'src/renderer/src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
const crlf = app.includes('\r\n');
const n = (s) => (crlf ? s.replace(/\n/g, '\r\n') : s);

if (app.includes("detail.op === 'aiCancelled'")) {
  console.log('App already patched');
} else {
  const re = /if \(detail\.op === 'aiChat' \|\| detail\.op === 'aiStreaming'\) \{[\s\S]*?return\r?\n      \}/;
  const m = app.match(re);
  if (!m) {
    // show context
    const i = app.indexOf("detail.op === 'aiChat'");
    console.log('context', JSON.stringify(app.slice(i - 20, i + 200)));
    throw new Error('block not found');
  }
  const neu = n(`if (
        detail.op === 'aiChat' ||
        detail.op === 'aiStreaming' ||
        detail.op === 'aiCancelled' ||
        detail.op === 'aiEmptyResume' ||
        detail.op === 'aiProdBanner' ||
        detail.op === 'aiSuggestCard' ||
        detail.op === 'aiError' ||
        detail.op === 'aiAccentStack'
      ) {
        setQuickOpen(false)
        setTourOpen(false)
        ensureAiVisible()
        openRightPanelRef.current('ai')
        // AIPanel listens for the same event to seed / clear the demo conversation / streaming state.
        return
      }`);
  app = app.replace(re, neu);
  fs.writeFileSync(appPath, app, 'utf8');
  console.log('App.tsx patched');
}

const harPath = 'scripts/screenshot-key-screens.mjs';
let har = fs.readFileSync(harPath, 'utf8');
if (!har.includes('ai-shot-matrix-r14')) {
  har = har.replace(
    `import { stdAiScenarios, aiTableScenarioNames, AI_E2E_TABLE } from './e2e-ai-table.mjs'`,
    `import { stdAiScenarios, aiTableScenarioNames, AI_E2E_TABLE } from './e2e-ai-table.mjs'\nimport { r14AiShots, R14_AI_SHOT_NAMES } from './ai-shot-matrix-r14.mjs'`
  );
  const re2 = /\{ name: 'r7-h05-stop', size: W, steps: \[[\s\S]*?\], wait: 1000 \}\r?\n\]/;
  const m2 = har.match(re2);
  if (!m2) throw new Error('r7 tail not found');
  const inject =
    m2[0].replace(/\r?\n\]$/, '') +
    `,\n` +
    `  // Round 14: standardized AI state matrix (declarative — see scripts/ai-shot-matrix-r14.mjs)\n` +
    `  ...\${JSON.stringify(r14AiShots())}.map((s) => ({\n` +
    `    name: s.name,\n` +
    `    size: s.narrow ? N : W,\n` +
    `    wait: s.wait || 1000,\n` +
    `    steps: s.steps,\n` +
    `    expect: s.expect || undefined\n` +
    `  }))\n` +
    `]`;
  // Wait - we need literal ${JSON.stringify in the file for the outer template.
  // Using \${ in this template above - in the .cjs file as a normal string with `...`, \${ becomes ${
  har = har.replace(re2, inject);
  fs.writeFileSync(harPath, har, 'utf8');
  console.log('harness patched, inject has stringify', har.includes('${JSON.stringify(r14AiShots())}'));
} else {
  console.log('harness already imported');
}
console.log('App has cancelled', fs.readFileSync(appPath,'utf8').includes('aiCancelled'));
console.log('har has r14', fs.readFileSync(harPath,'utf8').includes('r14AiShots()'));
