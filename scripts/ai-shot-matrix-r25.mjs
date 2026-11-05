/** Round 25: failure evidence matrix with short 「下一步 · n」 next-confirm (wide+narrow).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 * Builds on R22 aiFailureEvidence + R24 short nextConfirmStep label.
 */
export const R25_AI_SHOT_NAMES = [
  'r25-failure-evidence',
  'r25-failure-evidence-narrow',
  'r25-failure-next-confirm',
  'r25-failure-next-confirm-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r25AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectFail =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-retry]')&&document.querySelector('[data-testid=ai-failure-title]')&&document.querySelector('[data-testid=ai-exec-replay].has-failure-pin'))"
  // R24 short label + aligned step (handler sets runProgress step:2 max:3)
  const expectNext =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-next-confirm][data-aligned-step=\"2\"]')&&document.querySelector('[data-testid=ai-pending-confirm][data-after-failure=\"1\"]')&&document.querySelector('[data-testid=ai-pending-agree]')&&/(下一步\\s*·\\s*2|Next\\s*·\\s*2)/.test((document.querySelector('[data-testid=ai-failure-next-confirm]')||{}).textContent||''))"
  return [
    {
      name: 'r25-failure-evidence',
      wait: 1400,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r25-failure-evidence-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r25-failure-next-confirm',
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectNext
    },
    {
      name: 'r25-failure-next-confirm-narrow',
      narrow: true,
      wait: 1600,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectNext
    }
  ]
}
