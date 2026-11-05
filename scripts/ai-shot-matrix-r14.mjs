/** Round 14: declarative AI screenshot matrix (Electron harness).
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
