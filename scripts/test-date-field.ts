import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addDays, addMonths, fmtYmd, monthGrid, parseYmd, withinYmd } from '../src/shared/date-grid'

// DF1 pure helpers
assert.deepEqual(parseYmd('2026-10-21'), { y: 2026, m: 9, d: 21 })
assert.equal(parseYmd('2026-02-30'), null)
assert.equal(parseYmd('bad'), null)
assert.equal(fmtYmd({ y: 2026, m: 0, d: 5 }), '2026-01-05')
assert.equal(fmtYmd(addDays({ y: 2026, m: 11, d: 31 }, 1)), '2027-01-01')
assert.equal(fmtYmd(addMonths({ y: 2026, m: 0, d: 31 }, 1)), '2026-02-28')
assert.equal(fmtYmd(addMonths({ y: 2028, m: 0, d: 31 }, 1)), '2028-02-29')
const g = monthGrid(2026, 9) // Oct 2026 starts on Thursday
assert.equal(g.length, 42)
assert.equal(fmtYmd(g[0]), '2026-09-28') // Monday before
assert.equal(g.filter((c) => c.inMonth).length, 31)
assert.equal(fmtYmd(g.find((c) => c.inMonth)!), '2026-10-01')
assert.ok(withinYmd('2026-10-10', '2026-10-01', '2026-10-31'))
assert.ok(!withinYmd('2026-09-30', '2026-10-01'))
assert.ok(withinYmd('2026-09-30'))

// Audit log uses the themed field, no native date inputs left
const audit = readFileSync('src/renderer/src/components/AuditLogPanel.tsx', 'utf8')
assert.ok(!/type="date"/.test(audit), 'no native date input in audit log')
assert.match(audit, /<DateField testId="audit-since"[^>]*max=\{until \|\| undefined\}/)
assert.match(audit, /<DateField testId="audit-until"[^>]*min=\{since \|\| undefined\}/)

// Popover rules (dev-rules 7, 11, 17): outside-click close, close-menus event, Esc, theme z-index
const df = readFileSync('src/renderer/src/components/ui/DateField.tsx', 'utf8')
assert.match(df, /window.addEventListener\('mousedown', onDown, true\)/)
assert.match(df, /window.addEventListener\('aiss:close-menus', onClose\)/)
assert.match(df, /e.key === 'Escape'/)
assert.match(df, /popRef.current\?\.contains\(n\) \|\| btnRef.current\?\.contains\(n\)/, 'clicks inside keep it open')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.df-pop \{ position: fixed; z-index: var\(--z-menu\)/)
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['df.pick', 'df.clear', 'df.month', 'df.today', 'df.weekdays']) assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
console.log('test-date-field ok')
