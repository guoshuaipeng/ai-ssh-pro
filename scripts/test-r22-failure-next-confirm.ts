/** R22 polish: failure pin ↔ next confirm dock + audit miss calm toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAuditOpenAiMissToast, hasFailedExecPin } from '../src/shared/ai-audit-miss'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const miss = buildAuditOpenAiMissToast()
assert.equal(miss.kind, 'info')
assert.equal(miss.theme, 'info')
assert.ok(miss.ms >= 5000)
assert.equal(miss.messageKey, 'au2.openAiMiss')
assert.equal(miss.actionKey, 'au2.openAiMissAction')

assert.equal(hasFailedExecPin([]), false)
assert.equal(hasFailedExecPin([{ role: 'assistant', exec: { status: 'ok' } }]), false)
assert.equal(hasFailedExecPin([{ role: 'assistant', exec: { status: 'failed' } }]), true)

assert.ok(translate('zh-CN', 'au2.openAiMiss').includes('当前对话'))
assert.equal(translate('zh-CN', 'au2.openAiMissAction'), '回到顶部')
assert.equal(translate('zh-CN', 'fail.nextConfirm'), '下一步待确认')
assert.ok(translate('zh-CN', 'fail.nextConfirmTip').includes('不会静默'))
assert.equal(translate('en', 'au2.openAiMissAction'), 'Back to top')
assert.equal(translate('en', 'fail.nextConfirm'), 'Next confirm')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('buildAuditOpenAiMissToast'))
assert.ok(panel.includes("kind: miss.kind"))
assert.ok(panel.includes("tg(miss.actionKey)"))
assert.ok(panel.includes('data-testid="ai-failure-next-confirm"'))
assert.ok(panel.includes('data-after-failure='))
assert.ok(panel.includes('is-after-failure-focus'))
assert.ok(panel.includes('shot-r22-next'))
assert.ok(!/showToast\(tg\('au2\.openAiMiss'\)\s*\)/.test(panel), 'bare miss toast must use helper')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R22 Round22: failure→next-confirm'))
assert.ok(css.includes('.ai-panel .ai-failure-next-confirm'))
assert.ok(css.includes('.ai-panel .ai-pending-confirm.is-after-failure'))
const start = css.indexOf('R22 Round22: failure→next-confirm')
const end = css.indexOf('/* R21 Round21:', start)
const block = css.slice(start, end > start ? end : start + 2000)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R22 CSS')

const jump = norm('scripts/test-ai-jump-from-audit.ts')
assert.ok(jump.includes("au2.openAiMiss"))

console.log('test-r22-failure-next-confirm: ok')
