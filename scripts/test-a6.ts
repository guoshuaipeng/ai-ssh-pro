/**
 * A6: explain a terminal selection as a read-only summary and an optional command draft.
 * Run: npx tsx --tsconfig tsconfig.web.json scripts/test-a6.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeAssist } from '../src/main/ai-assist.ts'
import { buildPaletteEntries, paletteMatch } from '../src/renderer/src/lib/palette.ts'
import { translate } from '../src/renderer/src/lib/i18n.tsx'
import { commandAutoRunAllowed } from '../src/shared/ai-reply-cards.ts'
import {
  canExplainSelection,
  normalizeSelectionExplain,
  planSelectionExplain,
  selectionCommandAutoRuns,
  selectionDraftChoice,
  selectionRiskToAi
} from '../src/shared/selection-explain.ts'

const zh = (key: Parameters<typeof translate>[1]) => translate('zh-CN', key)
const en = (key: Parameters<typeof translate>[1]) => translate('en', key)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string } }
assert.equal(pkg.version, '0.4.10')
assert.ok(pkg.scripts.test.includes('scripts/test-a6.ts'))

assert.equal(canExplainSelection('  df -h  '), true)
assert.equal(canExplainSelection('   '), false)
assert.equal(canExplainSelection(''), false)
assert.deepEqual(planSelectionExplain({ text: '', configured: false }), { status: 'empty' })
assert.deepEqual(planSelectionExplain({ text: '   ', configured: true }), { status: 'empty' })
const unconfigured = planSelectionExplain({ text: 'No space left on device', configured: false })
assert.deepEqual(unconfigured, { status: 'unconfigured' })
assert.equal(selectionCommandAutoRuns(), false)
assert.equal(commandAutoRunAllowed('low'), false)
assert.equal(commandAutoRunAllowed('high'), false)

const ready = planSelectionExplain({ text: ' disk full ', configured: true })
assert.deepEqual(ready, { status: 'ready', text: 'disk full' })

const draft = normalizeSelectionExplain({
  summary: '磁盘已满',
  command: 'df -h\nrm -rf /',
  riskLevel: 'high',
  notes: '先看用量',
  execute: true,
  autoRun: true
})
assert.ok(draft)
assert.equal(draft.summary, '磁盘已满')
assert.equal(draft.command, 'df -h rm -rf /')
assert.equal(draft.riskLevel, 'high')
assert.equal('execute' in draft, false)
assert.equal('autoRun' in draft, false)
assert.equal(selectionCommandAutoRuns(), false)
assert.deepEqual(selectionDraftChoice('agree'), { confirm: true, discard: false, write: false })
assert.deepEqual(selectionDraftChoice('disagree'), { confirm: false, discard: true, write: false })
assert.equal(selectionRiskToAi('high'), 'danger')
assert.equal(selectionRiskToAi('low'), 'safe')
assert.equal(selectionRiskToAi('medium'), 'caution')

const summaryOnly = normalizeSelectionExplain('```json\n{"description":"端口 22 在听","command":"","risk":"safe"}\n```')
assert.ok(summaryOnly)
assert.equal(summaryOnly.summary, '端口 22 在听')
assert.equal(summaryOnly.command, undefined)
assert.equal(summaryOnly.riskLevel, 'low')

assert.equal(normalizeSelectionExplain({ execute: true }), null)
assert.equal(normalizeSelectionExplain('not json'), null)
assert.doesNotThrow(() => planSelectionExplain({ text: null, configured: false }))

const viaAssist = normalizeAssist('explainSelection', {
  summary: '权限不够',
  command: 'ls -l /var',
  risk: 'caution',
  autoRun: true
})
assert.equal(viaAssist.ok, true)
if (viaAssist.ok && viaAssist.kind === 'explainSelection') {
  assert.equal(viaAssist.command, 'ls -l /var')
  assert.equal(viaAssist.riskLevel, 'medium')
  assert.equal(selectionCommandAutoRuns(), false)
}
assert.equal(normalizeAssist('explainSelection', { notes: '' }).ok, false)

assert.equal(zh('a6.explain'), '解释选区')
assert.equal(en('a6.explain'), 'Explain selection')
assert.equal(zh('a6.title'), '解释选区')
assert.equal(en('a6.title'), 'Explain selection')
assert.ok(zh('a6.needSelection').length > 0 && en('a6.needSelection').length > 0)
assert.ok(zh('a6.draft').includes('草案') && en('a6.draft').toLowerCase().includes('draft'))
assert.ok(zh('ux37.needSelection').length > 0 && en('ux37.needSelection').length > 0)
assert.equal(zh('ux64.agreeRun'), '同意并执行')
assert.equal(en('ux64.disagree'), 'Decline')

const ids = paletteMatch('解释选区', 'zh-CN')
assert.ok(ids.includes('explainSelection'), 'Ctrl+K finds 解释选区')
assert.ok(paletteMatch('explain selection', 'en').includes('explainSelection'))
const zhEntry = buildPaletteEntries(
  [{ id: 'ai', label: { zh: 'AI', en: 'AI' }, items: [] }],
  'zh-CN'
).find((e) => e.id === 'explainSelection')
assert.equal(zhEntry?.label, '解释选区')
assert.equal(zhEntry?.category, 'ai')

const root = 'src'
const pane = readFileSync(`${root}/renderer/src/components/TerminalPane.tsx`, 'utf8')
const app = readFileSync(`${root}/renderer/src/App.tsx`, 'utf8')
const card = readFileSync(`${root}/renderer/src/components/SelectionExplainCard.tsx`, 'utf8')
const toolbar = readFileSync(`${root}/renderer/src/components/AppToolbar.tsx`, 'utf8')
const panel = readFileSync(`${root}/renderer/src/components/AIPanel.tsx`, 'utf8')
const events = readFileSync(`${root}/renderer/src/lib/ai-events.ts`, 'utf8')
const changelog = readFileSync('CHANGELOG.md', 'utf8')

assert.ok(pane.includes("id: 'a6Explain'") && pane.includes("tg('a6.explain')") && pane.includes('disabled: !hasSel'))
assert.ok(pane.includes('requestSelectionExplain'))
assert.ok(app.includes("action === 'explainSelection'") && app.includes('requestSelectionExplain'))
assert.ok(app.includes('currentTerminalSelection'))

const cardUse = app.slice(app.indexOf('<SelectionExplainCard'), app.indexOf('<AIPanel'))
assert.ok(cardUse.includes('confirmAndRunAiCommand'))
assert.ok(cardUse.includes('selectionRiskToAi'))
assert.equal(cardUse.includes('ssh.write'), false)
assert.equal(cardUse.includes('dispatchInjectTerminal'), false)

assert.ok(card.includes('data-auto-run="false"') && card.includes('data-readonly="true"'))
assert.ok(card.includes('data-card="command"') && card.includes('ai-reply-cmd-code') && card.includes('ai-risk-badge'))
assert.ok(card.includes("t('ux64.agreeRun')") && card.includes("t('ux64.disagree')"))
assert.ok(card.includes('selectionDraftChoice(\'agree\')') && card.includes('selectionDraftChoice(\'disagree\')'))
assert.ok(card.includes('data-testid="a6-unconfigured"') && card.includes('AiConfigCard') && card.includes("t('ux37.needSelection')"))
assert.equal(card.includes('ssh.write'), false)
assert.equal(card.includes('dispatchInjectTerminal'), false)
assert.equal(card.includes('window.confirm'), false)

assert.ok(events.includes("flashAiConfig('selection')") && events.includes('aiss-open-right-panel'))
assert.ok(panel.includes("reason === 'selection'") && panel.includes("tg('ux37.needSelection')"))
assert.ok(panel.includes('AiConfigCard'))

const opsStart = toolbar.indexOf('OPS_BUTTONS')
const ops = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal(ops.includes('explainSelection'), false)
assert.equal(toolbar.includes('a6.explain'), false)
assert.equal(toolbar.includes("data-tool=\"explainSelection\""), false)

const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const at = (label: string) => {
  const i = unreleased.indexOf(label)
  assert.ok(i >= 0, `Unreleased keeps ${label}`)
  return i
}
const order = [at('Polish-3'), at('A-TFL'), at('L9'), at('A-OM'), at('A6')]
for (let i = 1; i < order.length; i++) assert.ok(order[i - 1]! < order[i]!, 'Unreleased order')
const l10 = unreleased.indexOf('L10')
if (l10 >= 0) assert.ok(unreleased.indexOf('A-OM') < l10 && l10 < unreleased.indexOf('A6'))
assert.ok(unreleased.includes('Polish-2') && unreleased.includes('Polish-1'))
assert.ok(unreleased.includes('解释选区') && unreleased.includes('Explain selection'))

console.log('test-a6 ok')
