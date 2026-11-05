/** Round 17: expand R14 AI screenshot matrix — ask plan progress + sticky batch bar.
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 */
export const R17_AI_SHOT_NAMES = [
  'r17-ask-progress',
  'r17-batch-sticky',
  'r17-batch-sticky-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r17AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  return [
    {
      name: 'r17-ask-progress',
      wait: 1300,
      steps: [...open, { op: 'aiAskProgress' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-run-steps]')&&document.querySelector('[data-testid=ai-run-steps]').getAttribute('data-policy')==='ask'&&document.querySelector('[data-testid=ai-active-plan-step]'))"
    },
    {
      name: 'r17-batch-sticky',
      wait: 1400,
      steps: [...open, { op: 'aiBatchSticky' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-batch-copy-bar]')&&document.querySelector('[data-testid=ai-batch-fill-next]')&&document.querySelector('[data-testid=ai-batch-copy]'))"
    },
    {
      name: 'r17-batch-sticky-narrow',
      narrow: true,
      wait: 1400,
      steps: [...open, { op: 'aiBatchSticky' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-batch-copy-bar]')&&document.querySelector('[data-testid=ai-batch-fill-next]'))"
    }
  ]
}
