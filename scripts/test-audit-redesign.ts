import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { auditRangeSince } from '../src/shared/audit-range'

const src = readFileSync('src/renderer/src/components/AuditLogPanel.tsx', 'utf8')
// AU2: no native select, dates only for custom range, clear + toggle live in More
assert.ok(!/<select/.test(src), 'no native select')
assert.match(src, /testId="audit-range"/)
assert.match(src, /range === 'custom' \? \(\s*<span className="au2-dates"/)
assert.match(src, /data-testid="audit-more"/)
assert.match(src, /id: 'clear', label: t\('audit.clear'\), danger: true/)
assert.ok(!/className="l4-check"/.test(src), 'toggle moved out of the filter row')
assert.match(src, /className="sr-only" tabIndex=\{-1\} data-testid="audit-clear"/)

const now = new Date(2026, 9, 21, 15)
assert.equal(auditRangeSince('all', now), '')
assert.equal(auditRangeSince('custom', now), '')
assert.equal(auditRangeSince('1d', now), '2026-10-21')
assert.equal(auditRangeSince('7d', now), '2026-10-15')
assert.equal(auditRangeSince('30d', new Date(2026, 2, 5)), '2026-02-04')

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['au2.more', 'au2.range', 'au2.rangeCustom', 'au2.count']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}
console.log('test-audit-redesign ok')
