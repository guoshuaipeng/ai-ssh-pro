/** Round 27: full-page visual audit pass + seeded jump-audit hit state.
 * Builds on R26 memory matrix; jumpAudit now seeds a matching audit row.
 */
export const R27_AI_SHOT_NAMES = [
  'r27-jump-audit-hit',
  'r27-jump-audit-hit-narrow',
  'r27-failure-memory',
  'r27-failure-memory-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r27AiShots() {
  const openPanel = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const memPayload = {
    op: 'aiMemoryEvidence',
    goal: '排查 nginx 502',
    hostFacts: ['web-01 / 10.0.0.8'],
    observations: ['df：/ 使用 91%'],
    recentCommands: ['systemctl status nginx --no-pager'],
    jumpAudit: true,
    seedAudit: true
  }
  const expectHit =
    "!!(document.querySelector('[data-testid=audit-log]')&&document.querySelector('[data-testid=audit-table]')&&!document.querySelector('[data-testid=audit-empty]')&&!document.querySelector('[data-testid=audit-filter-empty]')&&/systemctl\\s+status\\s+nginx/.test((document.querySelector('.au2-search')||{}).value||'')&&((document.querySelector('[data-testid=audit-count]')||{}).textContent||'').match(/[1-9]/))"
  const expectFailMem =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-memory-chip]')&&getComputedStyle(document.querySelector('[data-testid=ai-memory-chip]')).opacity!=='1')"
  return [
    {
      name: 'r27-jump-audit-hit',
      wait: 1800,
      steps: [...openPanel, { ...memPayload }],
      expect: expectHit
    },
    {
      name: 'r27-jump-audit-hit-narrow',
      narrow: true,
      wait: 1900,
      steps: [...openPanel, { ...memPayload }],
      expect: expectHit
    },
    {
      name: 'r27-failure-memory',
      wait: 1600,
      steps: [
        ...openPanel,
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect: expectFailMem
    },
    {
      name: 'r27-failure-memory-narrow',
      narrow: true,
      wait: 1700,
      steps: [
        ...openPanel,
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect: expectFailMem
    }
  ]
}
