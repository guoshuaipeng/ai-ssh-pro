/** Round 31: H08 empty / model-missing / HTTP error CTAs (narrow-first). */
export const R31_AI_SHOT_NAMES = [
  'r31-empty',
  'r31-empty-narrow',
  'r31-model-missing',
  'r31-model-missing-narrow',
  'r31-error-settings-narrow',
  'r31-error-retry-narrow',
  'r31-model-missing-vs-prod-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r31AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectEmpty =
    "!!(document.querySelector('[data-testid=ai-empty-state]')&&document.querySelector('[data-testid=ai-config-setup]')&&!document.querySelector('[data-testid=ai-model-missing]')&&!document.querySelector('[data-card=error]'))"
  const expectMissing =
    "!!(document.querySelector('[data-testid=ai-model-missing]')&&document.querySelector('[data-testid=ai-model-missing-settings]')&&!document.querySelector('[data-testid=ai-empty-state]')&&!document.querySelector('[data-testid=ai-prod-auto-banner]')&&!document.querySelector('[data-testid=ai-readonly-banner]'))"
  const expectErrSettings =
    "!!(document.querySelector('[data-card=error]')&&document.querySelector('[data-testid=ai-error-open-settings]')&&document.querySelector('[data-card=error]').getAttribute('data-primary')==='settings')"
  const expectErrRetry =
    "!!(document.querySelector('[data-card=error]')&&document.querySelector('[data-testid=ai-error-retry]')&&document.querySelector('[data-card=error]').getAttribute('data-primary')==='retry')"
  return [
    {
      name: 'r31-empty',
      wait: 1400,
      steps: [...open, { op: 'aiEmptyConfig' }],
      expect: expectEmpty
    },
    {
      name: 'r31-empty-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiEmptyConfig' }],
      expect: expectEmpty
    },
    {
      name: 'r31-model-missing',
      wait: 1400,
      steps: [...open, { op: 'aiModelMissing' }],
      expect: expectMissing
    },
    {
      name: 'r31-model-missing-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiModelMissing' }],
      expect: expectMissing
    },
    {
      name: 'r31-error-settings-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'AI_HTTP_401', message: '未授权：请检查 API Key。' }],
      expect: expectErrSettings
    },
    {
      name: 'r31-error-retry-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'AI_HTTP_429', message: '请求过于频繁，请稍后重试。' }],
      expect: expectErrRetry
    },
    {
      name: 'r31-model-missing-vs-prod-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiModelMissing', withProdBanner: true }],
      expect: expectMissing
    }
  ]
}
