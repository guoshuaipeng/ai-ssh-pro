/** Round 22: R21 failure evidence screenshot matrix (wide/narrow × themes via harness).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 */
export const R22_AI_SHOT_NAMES = [
  'r22-failure-evidence',
  'r22-failure-evidence-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r22AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectFail =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-retry]')&&document.querySelector('[data-testid=ai-failure-title]')&&document.querySelector('[data-testid=ai-exec-replay].has-failure-pin'))"
  return [
    {
      name: 'r22-failure-evidence',
      wait: 1400,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r22-failure-evidence-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    }
  ]
}
