/** Round 22: R21 failure evidence screenshot matrix (wide/narrow × themes via harness).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 * Round 22 polish: optional nextConfirm links failure pin → pending dock.
 */
export const R22_AI_SHOT_NAMES = [
  'r22-failure-evidence',
  'r22-failure-evidence-narrow',
  'r22-failure-next-confirm'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r22AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectFail =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-retry]')&&document.querySelector('[data-testid=ai-failure-title]')&&document.querySelector('[data-testid=ai-exec-replay].has-failure-pin'))"
  const expectLink =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-next-confirm]')&&document.querySelector('[data-testid=ai-pending-confirm][data-after-failure=\"1\"]')&&document.querySelector('[data-testid=ai-pending-agree]'))"
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
    },
    {
      name: 'r22-failure-next-confirm',
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectLink
    }
  ]
}
