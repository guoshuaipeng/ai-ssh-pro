const fs = require('fs');

// 1) Update matrix: open panel before state ops
const matrix = `/** Round 14: declarative AI screenshot matrix (Electron harness).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify — no nested eval quotes.
 * States: cancel-retry, D29 resume, busy, prod banner, suggest narrow, accent stack.
 *
 * Pattern: demoHost → aiChat(empty) mounts AIPanel → specialized op seeds the state.
 * AIPanel also replays window.__aissShotAiOp on mount (R14 gap fix).
 */
export const R14_AI_SHOT_NAMES = [
  'r14-cancel-retry',
  'r14-d29-resume',
  'r14-busy',
  'r14-prod-banner',
  'r14-suggest-narrow',
  'r14-accent-stack'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r14AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  return [
    {
      name: 'r14-cancel-retry',
      wait: 1200,
      steps: [...open, { op: 'aiCancelled' }],
      expect:
        "!!(document.querySelector('[data-card=cancelled]')&&document.querySelector('[data-testid=ai-cancelled-retry]')&&document.querySelector('[data-testid=ai-cancelled-label]'))"
    },
    {
      name: 'r14-d29-resume',
      wait: 1300,
      steps: [...open, { op: 'aiEmptyResume' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-resume-last]')&&document.querySelector('[data-testid=ai-resume-last]').getAttribute('data-resume-kind')==='troubleshoot')"
    },
    {
      name: 'r14-busy',
      wait: 1200,
      steps: [...open, { op: 'aiStreaming' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-busy-chip]')&&document.querySelector('[data-card=streaming]')&&document.querySelector('[data-testid=ai-stream-stop]'))"
    },
    {
      name: 'r14-prod-banner',
      wait: 1300,
      steps: [...open, { op: 'aiProdBanner' }],
      expect:
        "!!document.querySelector('[data-testid=ai-prod-auto-banner]')"
    },
    {
      name: 'r14-suggest-narrow',
      narrow: true,
      wait: 1400,
      steps: [...open, { op: 'aiSuggestCard' }],
      expect:
        "!!(document.querySelector('[data-testid=safety-suggest]')&&document.querySelector('[data-testid=safety-suggest-copy]'))"
    },
    {
      name: 'r14-accent-stack',
      wait: 1300,
      steps: [...open, { op: 'aiAccentStack' }],
      expect:
        "!!(document.querySelector('[data-card=streaming]')&&document.querySelector('[data-card=cancelled]')&&document.querySelector('[data-card=error]'))"
    }
  ]
}
`;
fs.writeFileSync('scripts/ai-shot-matrix-r14.mjs', matrix.replace(/\n/g, '\r\n'), 'utf8');

// 2) AIPanel: stash + replay pending AI shot ops (like __aissShotPop)
let panel = fs.readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8');
const crlf = panel.includes('\r\n');
const NL = crlf ? '\r\n' : '\n';

if (!panel.includes('__aissShotAiOp')) {
  // After aiComposerPop stash pattern, also stash R14 AI ops when received
  // Wrap: at start of onShot for R14 ops, store on window; on mount replay.

  // Find the listener setup end where pending pop is applied
  const mountReplay = `    window.addEventListener(SCREENSHOT_EVENT, onShot)
    if (screenshotHooksEnabled()) {
      const pending = (window as unknown as { __aissShotPop?: string }).__aissShotPop
      setModelOpen(pending === 'model')
      setSafetyOpen(pending === 'safety')
    }`;

  if (!panel.includes(mountReplay) && !panel.includes('__aissShotPop?: string').toString()) {
    // try flexible match
  }

  // Simpler approach: at the beginning of each R14 op handler AND aiStreaming, stash detail.
  // And after addEventListener, replay __aissShotAiOp by re-dispatching.

  const oldListen = /window\.addEventListener\(SCREENSHOT_EVENT, onShot\)\r?\n    if \(screenshotHooksEnabled\(\)\) \{\r?\n      const pending = \(window as unknown as \{ __aissShotPop\?: string \}\)\.__aissShotPop\r?\n      setModelOpen\(pending === 'model'\)\r?\n      setSafetyOpen\(pending === 'safety'\)\r?\n    \}/;

  const neuListen = `window.addEventListener(SCREENSHOT_EVENT, onShot)
    if (screenshotHooksEnabled()) {
      const pending = (window as unknown as { __aissShotPop?: string }).__aissShotPop
      setModelOpen(pending === 'model')
      setSafetyOpen(pending === 'safety')
      const pendingAi = (window as unknown as { __aissShotAiOp?: { op?: string } }).__aissShotAiOp
      if (pendingAi?.op) {
        // R14: panel may mount after the op event; replay once.
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: pendingAi }))
        }, 0)
      }
    }`;

  if (!oldListen.test(panel)) {
    console.error('listen block not found');
    const i = panel.indexOf('window.addEventListener(SCREENSHOT_EVENT, onShot)');
    console.log(JSON.stringify(panel.slice(i, i + 350)));
  } else {
    panel = panel.replace(oldListen, neuListen);
  }

  // Stash R14 ops at the top of onShot when hooks enabled
  const onShotStart = /const detail = \(ev as CustomEvent<\{ op\?: string; preview\?: string; requestId\?: string; action\?: string; empty\?: boolean; partial\?: string \}>\)\.detail\r?\n      if \(detail\?\.op === 'aiChat'\) \{/;

  const onShotNeu = `const detail = (ev as CustomEvent<{ op?: string; preview?: string; requestId?: string; action?: string; empty?: boolean; partial?: string; title?: string; command?: string; description?: string; message?: string; errorCode?: string }>).detail
      if (
        detail?.op === 'aiStreaming' ||
        detail?.op === 'aiCancelled' ||
        detail?.op === 'aiEmptyResume' ||
        detail?.op === 'aiProdBanner' ||
        detail?.op === 'aiSuggestCard' ||
        detail?.op === 'aiError' ||
        detail?.op === 'aiAccentStack'
      ) {
        ;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }
      if (detail?.op === 'aiChat') {`;

  if (!onShotStart.test(panel)) {
    console.error('onShot start not found');
  } else {
    panel = panel.replace(onShotStart, onShotNeu);
  }

  fs.writeFileSync('src/renderer/src/components/AIPanel.tsx', panel, 'utf8');
  console.log('AIPanel pending replay patched', panel.includes('__aissShotAiOp'));
} else {
  console.log('pending replay already present');
}
