/** Round 30: prod↔readonly host-banner contrast matrix (every-3 visual audit). */
export const R30_AI_SHOT_NAMES = [
  'r30-contrast-prod',
  'r30-contrast-prod-narrow',
  'r30-contrast-readonly',
  'r30-contrast-readonly-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r30AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectProd =
    "!!(document.querySelector('[data-testid=ai-prod-auto-banner]')&&!document.querySelector('[data-testid=ai-readonly-banner]')&&(document.querySelector('[data-testid=ai-prod-auto-banner]').textContent||'').includes('自动'))"
  const expectRo =
    "!!(document.querySelector('[data-testid=ai-readonly-banner]')&&!document.querySelector('[data-testid=ai-prod-auto-banner]')&&(document.querySelector('[data-testid=ai-readonly-banner]').textContent||'').includes('只读'))"
  return [
    {
      name: 'r30-contrast-prod',
      wait: 1400,
      steps: [...open, { op: 'aiProdBanner' }],
      expect: expectProd
    },
    {
      name: 'r30-contrast-prod-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiProdBanner' }],
      expect: expectProd
    },
    {
      name: 'r30-contrast-readonly',
      wait: 1400,
      steps: [...open, { op: 'aiReadonlyBanner' }],
      expect: expectRo
    },
    {
      name: 'r30-contrast-readonly-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiReadonlyBanner' }],
      expect: expectRo
    }
  ]
}
