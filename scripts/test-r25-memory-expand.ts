/** R25 polish: working-memory expand — touch target, collapse, audit jump. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMemoryEvidenceView } from '../src/shared/working-memory-view'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'wm.close'), '收起')
assert.equal(translate('zh-CN', 'wm.jumpAudit'), '审计')
assert.ok(translate('zh-CN', 'wm.jumpAuditTip').includes('审计'))
assert.equal(translate('en', 'wm.close'), 'Collapse')
assert.equal(translate('en', 'wm.jumpAudit'), 'Audit')

const view = buildMemoryEvidenceView({
  hostFacts: ['web-01'],
  observations: ['df high'],
  recentCommands: ['systemctl status nginx --no-pager ' + 'x'.repeat(60)],
  maxItems: 3,
  maxChars: 24
})
assert.equal(view.count, 3)
const cmd = view.items.find((it) => it.kind === 'recentCommand')
assert.ok(cmd)
assert.ok(cmd!.text.endsWith('…'), 'display truncated')
assert.ok(cmd!.query && cmd!.query.length > cmd!.text.length, 'query keeps full command')
assert.ok(cmd!.query!.startsWith('systemctl status nginx'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('data-testid="ai-memory-close"'))
assert.ok(panel.includes("tg('wm.close')"))
assert.ok(panel.includes('data-testid="ai-memory-jump-btn"'))
assert.ok(panel.includes('OPEN_AUDIT_EVENT'))
assert.ok(panel.includes("it.kind === 'recentCommand'"))
assert.ok(panel.includes('setMemoryOpen(false)'))
// jump uses full query, not truncated display
assert.ok(panel.includes('it.query || it.text'))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R25 Round25: working-memory expand UX'))
assert.ok(css.includes('.ai-panel .ai-memory-close'))
assert.ok(css.includes('.ai-panel .ai-memory-jump-btn') || css.includes('ai-memory-jump-btn'))
const chipIdx = css.indexOf('.ai-panel .ai-memory-chip {')
assert.ok(chipIdx >= 0)
const chipBlock = css.slice(chipIdx, chipIdx + 450)
assert.ok(chipBlock.includes('min-height: 28px'), 'touch target')
assert.ok(chipBlock.includes('padding: var(--space-1) var(--space-2)'))
const start = css.indexOf('R25 Round25: working-memory expand UX')
const end = css.indexOf('.ai-panel .ai-header-shortcut kbd', start)
const block = css.slice(start, end > start ? end : start + 1800)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R25 CSS')

console.log('test-r25-memory-expand: ok')
