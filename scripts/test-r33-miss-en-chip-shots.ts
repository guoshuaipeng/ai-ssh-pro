/** R33: miss toast + EN Ask chip screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r33AiShots, R33_AI_SHOT_NAMES } from './ai-shot-matrix-r33.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r33AiShots()
assert.deepEqual(shots.map((s) => s.name), R33_AI_SHOT_NAMES)
assert.equal(R33_AI_SHOT_NAMES.length, 6)

const miss = shots.find((s) => s.name === 'r33-miss-toast')
assert.equal(miss?.toasts, true)
assert.ok(miss?.steps?.some((st) => st.op === 'aiMissToast'))
assert.ok(miss?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'zh-CN'))
assert.ok(miss?.expect?.includes('querySelectorAll'))
assert.ok(miss?.expect?.includes('toast-action'))
assert.ok(miss?.expect?.includes('新开对话'))

const missN = shots.find((s) => s.name === 'r33-miss-toast-narrow')
assert.equal(missN?.narrow, true)
assert.equal(missN?.toasts, true)

const en = shots.find((s) => s.name === 'r33-en-ask-chip')
assert.ok(en?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'en'))
assert.ok(en?.expect?.includes("'Ask'"))

const enN = shots.find((s) => s.name === 'r33-en-ask-chip-narrow')
assert.equal(enN?.narrow, true)

const pop = shots.find((s) => s.name === 'r33-en-ask-pop')
assert.ok(pop?.steps?.some((st) => st.op === 'aiComposerPop'))
assert.ok(pop?.expect?.includes('ai-safety-pop'))

const popN = shots.find((s) => s.name === 'r33-en-ask-pop-narrow')
assert.equal(popN?.narrow, true)

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiMissToast'))
assert.ok(hooks.includes('op: "locale"') || hooks.includes("op: 'locale'") || hooks.includes('op: "locale"'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiMissToast'"))
assert.ok(panel.includes('Round 33: calm miss toast'))
assert.ok(panel.includes('clearToasts'))
assert.ok(panel.includes('buildAuditOpenAiMissToast'))
assert.ok(panel.includes('startNewChatRef.current?.()'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'locale'"))
assert.ok(app.includes("detail.op === 'aiMissToast'"))
assert.ok(app.includes('setLocale'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r33.mjs'"))
assert.ok(har.includes('r33AiShots()'))
assert.ok(har.includes('toasts: !!s.toasts'))

const readme = norm('docs/screenshots/r33/README.md')
assert.ok(readme.includes('aiMissToast'))
assert.ok(readme.includes('Ask'))
assert.ok(readme.includes('locale'))

const pkg = norm('package.json')
assert.ok(pkg.includes('test-r31-empty-error-shots'))
assert.ok(pkg.includes('test-r32-audit-miss-new-chat'))
assert.ok(pkg.includes('test-r33-visual-audit-toast'))
assert.ok(pkg.includes('test-r33-miss-en-chip-shots'))

console.log('test-r33-miss-en-chip-shots: ok', R33_AI_SHOT_NAMES.length)
