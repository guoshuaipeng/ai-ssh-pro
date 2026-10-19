/** Polish-7 / UX-64: AI replies are dark cards. Package is 0.4.8. No win.fileVersion. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import { commandAutoRunAllowed } from '../src/shared/ai-reply-cards'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.47')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-7.ts'), true)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-ux64.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(rawPkg.includes(tipSuggest), false)
assert.equal(rawPkg.includes(rollback), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.7'))
const published67 = changelog.slice(changelog.indexOf('## v0.4.7'), changelog.indexOf('## v0.4.6'))
const published66 = changelog.slice(changelog.indexOf('## v0.4.6'), changelog.indexOf('## v0.4.5'))
assert.ok(unreleased.includes('v0.4.8 soft-start'))
assert.ok(unreleased.includes('Polish-7'))
assert.ok(unreleased.includes('UX-64'))
assert.ok(unreleased.includes('Public HOLD'))
assert.ok(unreleased.includes('不打 tag'))
assert.ok(unreleased.includes('No tag'))
assert.ok(unreleased.includes('No GitHub Release'))
assert.ok(unreleased.includes('fileVersion'))
assert.ok(unreleased.includes('0.4.9-polish8'))
assert.ok(unreleased.includes('0.4.8-polish7'))
assert.equal(unreleased.includes('## v0.4.6'), false)
assert.ok(published67.includes('Polish-6'))
assert.ok(published67.includes('0.4.8-polish6'))
assert.ok(published67.includes('0.4.8-polish5'))
assert.equal(published67.includes('Polish-7'), false)
assert.ok(published66.includes('Polish-5'))
assert.equal(published66.includes('Polish-7'), false)
assert.equal(published66.includes('Public HOLD'), false)
assert.ok(changelogFor('0.4.8').length >= 4)
assert.ok(changelogFor('0.4.8').some((entry) => entry.action === 'openAi'))
assert.ok(changelogFor('0.4.7').some((entry) => entry.action === 'toggleSplit'))

assert.equal(commandAutoRunAllowed('low'), false)
assert.equal(commandAutoRunAllowed('high'), false)

const zhEmpty = zh('ux64.emptyHint')
const enEmpty = en('ux64.emptyHint')
assert.ok(zhEmpty.length > 0 && zhEmpty.length < 40, zhEmpty)
assert.ok(enEmpty.length > 0 && enEmpty.length < 90, enEmpty)
assert.equal(/^暂无|^无数据/.test(zhEmpty), false)
assert.equal(zhEmpty.includes('灰色'), false)
assert.equal(zh('ux64.agreeRun'), '同意并执行')
assert.equal(en('ux64.disagree'), 'Decline')
for (const level of ['low', 'medium', 'high'] as const) {
  assert.equal(zh('ux64.risk', { level }), `风险: ${level}`)
  assert.equal(en('ux64.risk', { level }), `Risk: ${level}`)
}

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(panel.includes('ai-dark-card'))
assert.ok(panel.includes('ai-card-head'))
assert.ok(panel.includes('ai-reply-cmd-code'))
assert.ok(panel.includes('ai-tool-step'))
assert.ok(panel.includes('data-testid="ai-reply-empty"'))
assert.ok(panel.includes("s.action === 'command' ? 'command'"))
assert.ok(panel.includes('data-card={card}'))
assert.ok(panel.includes('data-card="tool"'))
assert.equal(panel.includes('opacity: 0.85'), false)
assert.ok(panel.includes('confirmStep(l.requestId!, true)'))
assert.ok(panel.includes('confirmStep(l.requestId!, false)'))
assert.equal(panel.includes('autoApproveLowRiskCommand'), false)

const card = css.slice(css.indexOf('.msg.assistant.ai-dark-card'), css.indexOf('.msg.assistant.ai-card-error'))
assert.ok(card.includes('var(--color-bg-elevated)'))
assert.ok(card.includes('var(--color-border-default)'))
assert.equal(card.includes('#'), false)

const empty = css.slice(css.indexOf('.ai-reply-empty {'), css.indexOf('.ai-reply-empty p'))
assert.ok(empty.includes('background: transparent'))
assert.ok(empty.includes('border: none'))

const strip = css.slice(css.indexOf('.msg.assistant.ai-tool-strip {'), css.indexOf('.ai-tool-step'))
assert.ok(strip.includes('flex-wrap: nowrap'))
assert.ok(strip.includes('white-space: nowrap'))

const actions = css.slice(css.indexOf('.ai-reply-actions {'), css.indexOf('.ai-btn-wrap'))
assert.ok(actions.includes('flex-wrap: nowrap'))
assert.ok(actions.includes('white-space: nowrap'))

const badges = css.slice(css.indexOf('.ai-risk-low {'), css.indexOf('.ai-reply-notes'))
assert.ok(badges.includes('var(--color-ok-muted)'))
assert.ok(badges.includes('var(--color-warn-muted)'))
assert.ok(badges.includes('var(--color-danger-muted)'))
assert.equal(/var\(--[a-z0-9-]+,\s*#/.test(badges), false)

console.log('test-polish-7 ok')
