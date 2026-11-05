/** Round 33: every-3 visual audit — miss→New chat toast + EN Ask chip. */
export const R33_AI_SHOT_NAMES = [
  'r33-miss-toast',
  'r33-miss-toast-narrow',
  'r33-en-ask-chip',
  'r33-en-ask-chip-narrow',
  'r33-en-ask-pop',
  'r33-en-ask-pop-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,toasts?:boolean,steps:Array<object>,expect?:string}>} */
export function r33AiShots() {
  const openZh = [
    { op: 'locale', id: 'zh-CN' },
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const openEn = [
    { op: 'locale', id: 'en' },
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectMiss =
    "!!([...document.querySelectorAll('[data-testid=toast]')].some((t)=>(t.textContent||'').includes('新开对话')&&!!t.querySelector('[data-testid=toast-action]')))"
  const expectAsk =
    "!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()==='Ask')"
  const expectAskPop =
    "!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()==='Ask'&&document.querySelector('[data-testid=ai-safety-pop]'))"
  return [
    {
      name: 'r33-miss-toast',
      toasts: true,
      wait: 1600,
      steps: [...openZh, { op: 'aiMissToast' }],
      expect: expectMiss
    },
    {
      name: 'r33-miss-toast-narrow',
      narrow: true,
      toasts: true,
      wait: 1700,
      steps: [...openZh, { op: 'aiMissToast' }],
      expect: expectMiss
    },
    {
      name: 'r33-en-ask-chip',
      wait: 1500,
      steps: [...openEn],
      expect: expectAsk
    },
    {
      name: 'r33-en-ask-chip-narrow',
      narrow: true,
      wait: 1600,
      steps: [...openEn],
      expect: expectAsk
    },
    {
      name: 'r33-en-ask-pop',
      wait: 1600,
      steps: [...openEn, { op: 'aiComposerPop', which: 'safety' }],
      expect: expectAskPop
    },
    {
      name: 'r33-en-ask-pop-narrow',
      narrow: true,
      wait: 1700,
      steps: [...openEn, { op: 'aiComposerPop', which: 'safety' }],
      expect: expectAskPop
    }
  ]
}
