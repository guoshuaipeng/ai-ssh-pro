/** Round 29 polish: readonly host calm banner shot matrix (symmetric to r14-prod-banner). */
export const R29_AI_SHOT_NAMES = [
  'r29-readonly-banner',
  'r29-readonly-banner-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r29AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectRo =
    "!!(document.querySelector('[data-testid=ai-readonly-banner]')&&!document.querySelector('[data-testid=ai-prod-auto-banner]')&&(document.querySelector('[data-testid=ai-readonly-banner]').textContent||'').includes('只读'))"
  return [
    {
      name: 'r29-readonly-banner',
      wait: 1400,
      steps: [...open, { op: 'aiReadonlyBanner' }],
      expect: expectRo
    },
    {
      name: 'r29-readonly-banner-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiReadonlyBanner' }],
      expect: expectRo
    }
  ]
}
