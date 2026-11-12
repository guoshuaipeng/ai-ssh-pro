const fs = require('fs');

// App.tsx: open AI panel for new R14 ops
const appPath = 'src/renderer/src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
const old = `      if (detail.op === 'aiChat' || detail.op === 'aiStreaming') {
        setQuickOpen(false)
        setTourOpen(false)
        ensureAiVisible()
        openRightPanelRef.current('ai')
        // AIPanel listens for the same event to seed / clear the demo conversation / streaming state.
        return
      }`;
const neu = `      if (
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
      }`;
if (!app.includes(old)) {
  if (app.includes("detail.op === 'aiCancelled'")) console.log('App already patched');
  else throw new Error('App aiChat block not found');
} else {
  app = app.replace(old, neu);
  fs.writeFileSync(appPath, app, 'utf8');
  console.log('App.tsx patched');
}

// screenshot-key-screens.mjs: import + inject R14 shots
const harPath = 'scripts/screenshot-key-screens.mjs';
let har = fs.readFileSync(harPath, 'utf8');
if (!har.includes('ai-shot-matrix-r14')) {
  har = har.replace(
    `import { stdAiScenarios, aiTableScenarioNames, AI_E2E_TABLE } from './e2e-ai-table.mjs'`,
    `import { stdAiScenarios, aiTableScenarioNames, AI_E2E_TABLE } from './e2e-ai-table.mjs'\nimport { r14AiShots, R14_AI_SHOT_NAMES } from './ai-shot-matrix-r14.mjs'`
  );
  // Inject after r7-h05-stop scenario, before closing chrome array
  const needle = `  { name: 'r7-h05-stop', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiStreaming' }, { eval: "(()=>{const stop=document.querySelector('[data-testid=ai-stop]'); const cardStop=document.querySelector('[data-testid=ai-stream-stop]'); const partial=document.querySelector('[data-testid=ai-stream-partial]'); const stream=document.querySelector('[data-card=streaming]'); return JSON.stringify({stop:!!stop,cardStop:!!cardStop,partial:!!(partial&&partial.textContent&&partial.textContent.trim()),stream:!!stream})})()" }], wait: 1000 }\n]`;
  const inject = `  { name: 'r7-h05-stop', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiStreaming' }, { eval: "(()=>{const stop=document.querySelector('[data-testid=ai-stop]'); const cardStop=document.querySelector('[data-testid=ai-stream-stop]'); const partial=document.querySelector('[data-testid=ai-stream-partial]'); const stream=document.querySelector('[data-card=streaming]'); return JSON.stringify({stop:!!stop,cardStop:!!cardStop,partial:!!(partial&&partial.textContent&&partial.textContent.trim()),stream:!!stream})})()" }], wait: 1000 },
  // Round 14: standardized AI state matrix (declarative — see scripts/ai-shot-matrix-r14.mjs)
  ...${JSON.stringify(r14AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]`;
  if (!har.includes(needle)) throw new Error('r7-h05-stop chrome tail not found');
  // Note: the replacement string above uses ${JSON.stringify...} which would interpolate in THIS script.
  // We need the LITERAL text with ${JSON.stringify(r14AiShots())} in the harness template.
  const injectLiteral =
    "  { name: 'r7-h05-stop', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiStreaming' }, { eval: \"(()=>{const stop=document.querySelector('[data-testid=ai-stop]'); const cardStop=document.querySelector('[data-testid=ai-stream-stop]'); const partial=document.querySelector('[data-testid=ai-stream-partial]'); const stream=document.querySelector('[data-card=streaming]'); return JSON.stringify({stop:!!stop,cardStop:!!cardStop,partial:!!(partial&&partial.textContent&&partial.textContent.trim()),stream:!!stream})})()\" }], wait: 1000 },\n" +
    "  // Round 14: standardized AI state matrix (declarative — see scripts/ai-shot-matrix-r14.mjs)\n" +
    "  ...${JSON.stringify(r14AiShots())}.map((s) => ({\n" +
    "    name: s.name,\n" +
    "    size: s.narrow ? N : W,\n" +
    "    wait: s.wait || 1000,\n" +
    "    steps: s.steps,\n" +
    "    expect: s.expect || undefined\n" +
    "  }))\n" +
    "]";
  har = har.replace(needle, injectLiteral);
  fs.writeFileSync(harPath, har, 'utf8');
  console.log('harness patched');
} else {
  console.log('harness already has r14 import');
}

// Verify
const har2 = fs.readFileSync(harPath, 'utf8');
console.log('has import', har2.includes('ai-shot-matrix-r14'));
console.log('has inject', har2.includes('r14AiShots()'));
console.log('has R14 names export unused ok', typeof R14_AI_SHOT_NAMES);
