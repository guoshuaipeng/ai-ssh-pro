/** Round 26: working-memory expand states — open / collapse / recent-cmd→audit jump.
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 * Builds on R20 aiMemoryEvidence + R25 close/jump UX.
 */
export const R26_AI_SHOT_NAMES = [
  'r26-memory-open',
  'r26-memory-open-narrow',
  'r26-memory-collapsed',
  'r26-memory-collapsed-narrow',
  'r26-memory-jump-audit',
  'r26-memory-jump-audit-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r26AiShots() {
  const openPanel = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const memPayload = {
    op: 'aiMemoryEvidence',
    goal: '排查 nginx 502',
    hostFacts: ['web-01 / 10.0.0.8'],
    observations: ['df：/ 使用 91%'],
    recentCommands: ['systemctl status nginx --no-pager']
  }
  const expectOpen =
    "!!(document.querySelector('[data-testid=ai-memory-pop]')&&document.querySelector('[data-testid=ai-memory-close]')&&document.querySelector('[data-testid=ai-memory-jump-btn]')&&document.querySelector('[data-testid=ai-memory-chip].is-open')&&document.querySelector('[data-testid=ai-memory-jump-label], .ai-memory-jump-label'))"
  const expectCollapsed =
    "!!(document.querySelector('[data-testid=ai-memory-chip]')&&document.querySelector('[data-testid=ai-memory-chip]').getAttribute('aria-expanded')==='false'&&!document.querySelector('[data-testid=ai-memory-pop]')&&document.querySelector('[data-testid=ai-memory-count]'))"
  const expectJump =
    "!!(document.querySelector('[data-testid=audit-log]')&&document.querySelector('.au2-search')&&/systemctl\\s+status\\s+nginx/.test((document.querySelector('.au2-search')||{}).value||''))"
  return [
    {
      name: 'r26-memory-open',
      wait: 1400,
      steps: [...openPanel, { ...memPayload, open: true }],
      expect: expectOpen
    },
    {
      name: 'r26-memory-open-narrow',
      narrow: true,
      wait: 1500,
      steps: [...openPanel, { ...memPayload, open: true }],
      expect: expectOpen
    },
    {
      name: 'r26-memory-collapsed',
      wait: 1400,
      steps: [...openPanel, { ...memPayload, open: false }],
      expect: expectCollapsed
    },
    {
      name: 'r26-memory-collapsed-narrow',
      narrow: true,
      wait: 1500,
      steps: [...openPanel, { ...memPayload, open: false }],
      expect: expectCollapsed
    },
    {
      name: 'r26-memory-jump-audit',
      wait: 1600,
      steps: [...openPanel, { ...memPayload, jumpAudit: true }],
      expect: expectJump
    },
    {
      name: 'r26-memory-jump-audit-narrow',
      narrow: true,
      wait: 1700,
      steps: [...openPanel, { ...memPayload, jumpAudit: true }],
      expect: expectJump
    }
  ]
}
