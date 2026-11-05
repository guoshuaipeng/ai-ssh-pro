/** Round 20: R19 debt — policy menu open + pending dock narrow screenshot matrix.
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 */
export const R20_AI_SHOT_NAMES = [
  'r20-policy-menu-open',
  'r20-pending-dock-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r20AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  return [
    {
      name: 'r20-policy-menu-open',
      wait: 1300,
      steps: [...open, { op: 'aiComposerPop', which: 'safety' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-safety-pop]')&&document.querySelector('[data-testid=ai-safety-chip].is-open')&&document.querySelector('[data-testid=ai-safety-option].is-current'))"
    },
    {
      name: 'r20-pending-dock-narrow',
      narrow: true,
      wait: 1400,
      steps: [...open, { op: 'aiConfirm', preview: 'systemctl restart nginx' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-pending-confirm]')&&document.querySelector('[data-testid=ai-pending-agree]')&&document.querySelector('[data-testid=ai-pending-confirm]').getAttribute('data-r19-narrow')==='1')"
    }
  ]
}
