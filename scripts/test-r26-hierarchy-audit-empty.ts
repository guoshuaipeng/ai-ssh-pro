/** R26 polish: failure+memory hierarchy + calm audit filter-empty copy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'au2.filterEmptyTitle'), '没有符合筛选的记录')
assert.equal(translate('zh-CN', 'au2.filterEmptyDesc'), '试试清空筛选或换个关键词')
assert.equal(translate('zh-CN', 'au2.clearFilters'), '清空筛选')
assert.equal(translate('en', 'au2.filterEmptyTitle'), 'No entries match these filters')
assert.equal(translate('en', 'au2.clearFilters'), 'Clear filters')
// true-empty copy must stay distinct
assert.equal(translate('zh-CN', 'pf4.auditTitle'), '还没有审计记录')
assert.notEqual(translate('zh-CN', 'au2.filterEmptyTitle'), translate('zh-CN', 'pf4.auditTitle'))

const alp = norm('src/renderer/src/components/AuditLogPanel.tsx')
assert.ok(alp.includes('filterEmpty'))
assert.ok(alp.includes("events.length > 0 && rows.length === 0"))
assert.ok(alp.includes('audit-filter-empty'))
assert.ok(alp.includes('audit-clear-filters'))
assert.ok(alp.includes("t('au2.filterEmptyTitle')"))
assert.ok(alp.includes("t('au2.clearFilters')"))
assert.ok(alp.includes('clearFilters'))
assert.ok(alp.includes("testId=\"audit-empty\""), 'true-empty path kept')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R26 Round26: failure pin + memory chip hierarchy'))
assert.ok(css.includes(":has([data-testid='ai-failure-evidence'])"))
assert.ok(css.includes('.ai-memory-chip'))
const start = css.indexOf('R26 Round26: failure pin + memory chip hierarchy')
const end = css.indexOf('R25 Round25: working-memory expand UX', start)
const block = css.slice(start, end > start ? end : start + 900)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R26 CSS')
assert.ok(block.includes('opacity: 0.78') || block.includes('opacity:0.78'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('withMemory'))
assert.ok(panel.includes("detail as { withMemory?: boolean }") || panel.includes('withMemory?: boolean'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('withMemory?: boolean'))

console.log('test-r26-hierarchy-audit-empty: ok')
