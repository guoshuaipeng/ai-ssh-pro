/** Round 34: ZH/EN policy chip contrast — Ask/Suggest/Auto vs 需确认/仅建议/自动. */
export const R34_AI_SHOT_NAMES = [
  'r34-zh-ask',
  'r34-zh-suggest',
  'r34-zh-auto',
  'r34-en-ask',
  'r34-en-suggest',
  'r34-en-auto',
  'r34-zh-ask-narrow',
  'r34-en-suggest-narrow',
  'r34-zh-ask-pop',
  'r34-en-ask-pop',
  'r34-failure-memory',
  'r34-failure-memory-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r34AiShots() {
  const open = (locale, policy) => [
    { op: 'locale', id: locale },
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true },
    { op: 'aiPolicy', id: policy }
  ]
  const expectChip = (label) =>
    `!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()===${JSON.stringify(label)}&&document.querySelector('[data-testid=ai-safety-chip]')&&['ask','suggest','auto'].includes(document.querySelector('[data-testid=ai-safety-chip]').getAttribute('data-policy')||''))`
  const expectPop = (label) =>
    `!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()===${JSON.stringify(label)}&&document.querySelector('[data-testid=ai-safety-pop]'))`
  return [
    { name: 'r34-zh-ask', wait: 1500, steps: open('zh-CN', 'ask'), expect: expectChip('需确认') },
    { name: 'r34-zh-suggest', wait: 1500, steps: open('zh-CN', 'suggest'), expect: expectChip('仅建议') },
    { name: 'r34-zh-auto', wait: 1500, steps: open('zh-CN', 'auto'), expect: expectChip('自动') },
    { name: 'r34-en-ask', wait: 1500, steps: open('en', 'ask'), expect: expectChip('Ask') },
    { name: 'r34-en-suggest', wait: 1500, steps: open('en', 'suggest'), expect: expectChip('Suggest') },
    { name: 'r34-en-auto', wait: 1500, steps: open('en', 'auto'), expect: expectChip('Auto') },
    { name: 'r34-zh-ask-narrow', narrow: true, wait: 1600, steps: open('zh-CN', 'ask'), expect: expectChip('需确认') },
    { name: 'r34-en-suggest-narrow', narrow: true, wait: 1600, steps: open('en', 'suggest'), expect: expectChip('Suggest') },
    {
      name: 'r34-zh-ask-pop',
      wait: 1600,
      steps: [...open('zh-CN', 'ask'), { op: 'aiComposerPop', which: 'safety' }],
      expect: expectPop('需确认')
    },
    {
      name: 'r34-en-ask-pop',
      wait: 1600,
      steps: [...open('en', 'ask'), { op: 'aiComposerPop', which: 'safety' }],
      expect: expectPop('Ask')
    },
    {
      name: 'r34-failure-memory',
      wait: 1600,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiChat', empty: true },
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect:
        "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-memory-chip]')&&parseFloat(getComputedStyle(document.querySelector('[data-testid=ai-memory-chip]')).opacity)<0.7&&getComputedStyle(document.querySelector('.ai-memory-chip-label')||document.createElement('span')).display==='none')"
    },
    {
      name: 'r34-failure-memory-narrow',
      narrow: true,
      wait: 1700,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiChat', empty: true },
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect:
        "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-memory-chip]')&&parseFloat(getComputedStyle(document.querySelector('[data-testid=ai-memory-chip]')).opacity)<0.7)"
    }
  ]
}
