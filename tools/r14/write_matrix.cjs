const fs = require('fs');
const path = require('path');

function write(p, s) {
  fs.writeFileSync(p, s.replace(/\n/g, '\r\n'), 'utf8');
  console.log('wrote', p, s.length);
}

// ---- 1) scripts/ai-shot-matrix-r14.mjs ----
write('scripts/ai-shot-matrix-r14.mjs', `/** Round 14: declarative AI screenshot matrix (Electron harness).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify — no nested eval quotes.
 * States: cancel-retry, D29 resume, busy, prod banner, suggest narrow, accent stack.
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
  return [
    {
      name: 'r14-cancel-retry',
      wait: 1000,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiCancelled' }
      ],
      expect:
        "!!(document.querySelector('[data-card=cancelled]')&&document.querySelector('[data-testid=ai-cancelled-retry]')&&document.querySelector('[data-testid=ai-cancelled-label]'))"
    },
    {
      name: 'r14-d29-resume',
      wait: 1100,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiEmptyResume' }
      ],
      expect:
        "!!(document.querySelector('[data-testid=ai-resume-last]')&&document.querySelector('[data-testid=ai-resume-last]').getAttribute('data-resume-kind')==='troubleshoot')"
    },
    {
      name: 'r14-busy',
      wait: 1000,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiStreaming' }
      ],
      expect:
        "!!(document.querySelector('[data-testid=ai-busy-chip]')&&document.querySelector('[data-card=streaming]')&&document.querySelector('[data-testid=ai-stream-stop]'))"
    },
    {
      name: 'r14-prod-banner',
      wait: 1100,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiProdBanner' }
      ],
      expect:
        "!!document.querySelector('[data-testid=ai-prod-auto-banner]')"
    },
    {
      name: 'r14-suggest-narrow',
      narrow: true,
      wait: 1200,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiSuggestCard' }
      ],
      expect:
        "!!(document.querySelector('[data-testid=safety-suggest]')&&document.querySelector('[data-testid=safety-suggest-copy]'))"
    },
    {
      name: 'r14-accent-stack',
      wait: 1100,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiAccentStack' }
      ],
      expect:
        "!!(document.querySelector('[data-card=streaming]')&&document.querySelector('[data-card=cancelled]')&&document.querySelector('[data-card=error]'))"
    }
  ]
}
`);

// ---- 2) screenshot-hooks.ts: extend ScreenshotOp ----
const hooksPath = 'src/renderer/src/lib/screenshot-hooks.ts';
let hooks = fs.readFileSync(hooksPath, 'utf8');
if (!hooks.includes('aiCancelled')) {
  hooks = hooks.replace(
    '  /** Round 7 H04/H05: put AI panel into a real busy+streaming state (no DOM inject). */\n  | { op: "aiStreaming"; partial?: string }\n',
    `  /** Round 7 H04/H05: put AI panel into a real busy+streaming state (no DOM inject). */\n  | { op: "aiStreaming"; partial?: string }\n  /** Round 14: cancelled mid-stream card with Retry CTA. */\n  | { op: "aiCancelled"; partial?: string }\n  /** Round 14: empty state + D29 troubleshoot resume chip (screenshot override). */\n  | { op: "aiEmptyResume"; title?: string }\n  /** Round 14: force AI panel production+auto banner (screenshot override). */\n  | { op: "aiProdBanner" }\n  /** Round 14: fresh suggest-only command card (Copy primary). */\n  | { op: "aiSuggestCard"; command?: string; description?: string }\n  /** Round 14: error card for accent hierarchy. */\n  | { op: "aiError"; message?: string; errorCode?: string }\n  /** Round 14: streaming + cancelled + error stacked for accent QA. */\n  | { op: "aiAccentStack" }\n`
  );
  fs.writeFileSync(hooksPath, hooks, 'utf8');
  console.log('patched screenshot-hooks.ts');
} else {
  console.log('screenshot-hooks already has aiCancelled');
}

console.log('matrix+hooks done');
