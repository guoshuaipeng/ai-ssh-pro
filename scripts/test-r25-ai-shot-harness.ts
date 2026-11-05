/** R25: failure evidence matrix covers short 「下一步 · n」 next-confirm (wide+narrow). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r25AiShots, R25_AI_SHOT_NAMES } from './ai-shot-matrix-r25.mjs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'fail.nextConfirmStep', { n: 2 }), '下一步 · 2')
assert.equal(translate('en', 'fail.nextConfirmStep', { n: 2 }), 'Next · 2')

const shots = r25AiShots()
assert.deepEqual(shots.map((s) => s.name), R25_AI_SHOT_NAMES, 'matrix names stable')
assert.equal(R25_AI_SHOT_NAMES.length, 4)
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const wide = shots.find((s) => s.name === 'r25-failure-evidence')
assert.ok(wide)
assert.notEqual(wide?.narrow, true)
assert.ok(wide?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(wide?.expect?.includes('ai-failure-evidence'))

const narrow = shots.find((s) => s.name === 'r25-failure-evidence-narrow')
assert.equal(narrow?.narrow, true)

const linked = shots.find((s) => s.name === 'r25-failure-next-confirm')
assert.ok(linked?.steps?.some((st) => st.op === 'aiFailureEvidence' && st.nextConfirm))
assert.ok(linked?.expect?.includes('data-aligned-step'))
assert.ok(linked?.expect?.includes('下一步') || linked?.expect?.includes('Next'))
assert.ok(linked?.expect?.includes('ai-failure-next-confirm'))
assert.ok(linked?.expect?.includes('data-after-failure'))

const linkedN = shots.find((s) => s.name === 'r25-failure-next-confirm-narrow')
assert.equal(linkedN?.narrow, true)
assert.ok(linkedN?.expect?.includes('data-aligned-step'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("tg('fail.nextConfirmStep', { n: alignedPlan.step })"))
assert.ok(panel.includes('data-aligned-step={alignedPlan.step || undefined}'))
assert.ok(panel.includes("detail?.op === 'aiFailureEvidence'"))
assert.ok(panel.includes('shot-r22-next') || panel.includes('shot-r21-fail'))
assert.ok(/planStepDisplayMax/.test(panel))
assert.ok(/import \{[\s\S]*planStepDisplayMax[\s\S]*\} from '@shared\/ai-suggestion-steps'/.test(panel))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r25.mjs'"))
assert.ok(har.includes('r25AiShots()'))

const readme = norm('docs/screenshots/r25/README.md')
assert.ok(readme.includes('下一步 · n') || readme.includes('next-confirm'))
assert.ok(readme.includes('r25-failure-next-confirm-narrow'))

console.log('test-r25-ai-shot-harness: ok', R25_AI_SHOT_NAMES.length)
