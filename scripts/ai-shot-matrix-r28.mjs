/** Round 28 polish: deliberate audit filter-empty (+ optional decline dock). */
export const R28_AI_SHOT_NAMES = [
  'r28-audit-filter-empty',
  'r28-audit-filter-empty-narrow',
  'r28-pending-decline-demoted',
  'r28-pending-decline-demoted-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r28AiShots() {
  const expectFilterEmpty =
    "!!(document.querySelector('[data-testid=audit-filter-empty]')&&document.querySelector('[data-testid=audit-clear-filters]')&&!document.querySelector('[data-testid=audit-empty]')&&!document.querySelector('[data-testid=audit-table]'))"
  // Decline demoted: transparent bg; Agree keeps accent fill
  const expectDecline =
    "!!(document.querySelector('[data-testid=ai-pending-decline]')&&document.querySelector('[data-testid=ai-pending-agree]')&&getComputedStyle(document.querySelector('[data-testid=ai-pending-decline]')).backgroundColor!==getComputedStyle(document.querySelector('[data-testid=ai-pending-agree]')).backgroundColor&&(getComputedStyle(document.querySelector('[data-testid=ai-pending-decline]')).backgroundColor==='rgba(0, 0, 0, 0)'||getComputedStyle(document.querySelector('[data-testid=ai-pending-decline]')).backgroundColor==='transparent'))"
  return [
    {
      name: 'r28-audit-filter-empty',
      wait: 1600,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'auditFilterEmpty', host: 'demo', query: 'zzz-r28-no-match', seedDetail: 'systemctl status nginx --no-pager' }
      ],
      expect: expectFilterEmpty
    },
    {
      name: 'r28-audit-filter-empty-narrow',
      narrow: true,
      wait: 1700,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'auditFilterEmpty', host: 'demo', query: 'zzz-r28-no-match', seedDetail: 'systemctl status nginx --no-pager' }
      ],
      expect: expectFilterEmpty
    },
    {
      name: 'r28-pending-decline-demoted',
      wait: 1400,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiChat', empty: true },
        { op: 'aiAskProgress', step: 1, max: 3, preview: 'rm -rf /var/log/*.gz' }
      ],
      expect: expectDecline
    },
    {
      name: 'r28-pending-decline-demoted-narrow',
      narrow: true,
      wait: 1500,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiChat', empty: true },
        { op: 'aiAskProgress', step: 1, max: 3, preview: 'rm -rf /var/log/*.gz' }
      ],
      expect: expectDecline
    }
  ]
}
