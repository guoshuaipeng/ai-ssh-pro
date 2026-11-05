/** Round 17: jump from audit row back to AI dialog (inverse of 2.3). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const er = norm('src/renderer/src/components/ExecReplay.tsx')
assert.ok(er.includes("OPEN_AI_FROM_AUDIT_EVENT = 'aiss-open-ai-from-audit'"))
assert.ok(er.includes('OpenAiFromAuditDetail'))

const alp = norm('src/renderer/src/components/AuditLogPanel.tsx')
assert.ok(alp.includes('OPEN_AI_FROM_AUDIT_EVENT'))
assert.ok(alp.includes('data-testid="audit-open-ai"'))
assert.ok(alp.includes("e.source === 'AI'"))
assert.ok(alp.includes("e.type === 'command' || e.type === 'ai.action'"))
assert.ok(alp.includes("t('au2.openAi')"))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes('OPEN_AI_FROM_AUDIT_EVENT'))
assert.ok(app.includes('aiFocusExecToken'))
assert.ok(app.includes('focusExecToken={aiFocusExecToken}'))
assert.ok(app.includes('focusExec={aiFocusExec}'))
assert.ok(app.includes('Round 17: jump from audit'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('focusExecToken'))
assert.ok(panel.includes('data-exec-audit-id='))
assert.ok(panel.includes('data-exec-command='))
assert.ok(panel.includes('is-audit-focus'))
assert.ok(panel.includes('buildAuditOpenAiMissToast'))
assert.ok(panel.includes('miss.messageKey'))
assert.ok(norm('src/shared/ai-audit-miss.ts').includes('au2.openAiMiss'))

const i18n = norm('src/renderer/src/lib/i18n.tsx')
for (const k of ['au2.openAi', 'au2.openAiTip', 'au2.openAiMiss', 'au2.openAiMissAction']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}

const css = norm('src/renderer/src/features.css') + norm('src/renderer/src/styles.css')
assert.ok(css.includes('.au2-open-ai'))
assert.ok(css.includes('is-audit-focus'))

console.log('test-ai-jump-from-audit: OK')
