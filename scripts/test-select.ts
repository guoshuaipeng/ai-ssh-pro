/** C2: themed Select — keyboard helpers and the native <select> budget. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { countNativeSelects, nextEnabled, typeAheadIndex } from '../src/shared/select-nav'

let n = 0
const ok = (s: string) => {
  n++
  console.log('ok -', s)
}
const opts = [{ label: 'Alpha' }, { label: 'beta', disabled: true }, { label: 'Bravo' }, { label: 'Charlie' }]
assert.equal(nextEnabled(opts, 0, 1), 2, 'skips disabled')
assert.equal(nextEnabled(opts, 3, 1), 0, 'wraps forward')
assert.equal(nextEnabled(opts, 0, -1), 3, 'wraps back')
assert.equal(nextEnabled([{ label: 'x', disabled: true }], 0, 1), 0)
ok('nextEnabled')
assert.equal(typeAheadIndex(opts, 'b', 0), 2, 'disabled beta skipped')
assert.equal(typeAheadIndex(opts, 'b', 2), 2, 'only one enabled b')
assert.equal(typeAheadIndex(opts, 'a', 3), 0)
assert.equal(typeAheadIndex(opts, 'br', 0), 2)
assert.equal(typeAheadIndex(opts, 'z', 0), -1)
ok('typeAheadIndex')
assert.equal(countNativeSelects('<select value>\n<select\n  x>\n<selection>'), 2)
ok('countNativeSelects')

// the five replaced call sites use the themed Select, not a native one
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
for (const [file, testId] of [
  ['src/renderer/src/components/AiConfigForm.tsx', 'ai-provider-select'],
  ['src/renderer/src/components/AiConfigForm.tsx', 'ai-model-select'],
  ['src/renderer/src/components/PortForwardModal.tsx', 'pf-session'],
  ['src/renderer/src/components/AuditLogPanel.tsx', 'audit-type'],
  ['src/renderer/src/components/SettingsPanel.tsx', 'settings-language']
] as const) {
  const s = read(file)
  assert.ok(s.includes(`testId="${testId}"`), `${file} uses <Select testId="${testId}">`)
}
assert.equal(countNativeSelects(read('src/renderer/src/components/AiConfigForm.tsx')), 0)
assert.equal(countNativeSelects(read('src/renderer/src/components/PortForwardModal.tsx')), 0)
assert.equal(countNativeSelects(read('src/renderer/src/components/AuditLogPanel.tsx')), 0)
ok('five high-traffic selects replaced')

const sel = read('src/renderer/src/components/ui/Select.tsx')
for (const a of ['role="combobox"', 'role="listbox"', 'role="option"', 'aria-expanded', 'aria-activedescendant', "'Escape'", "'ArrowDown'"]) {
  assert.ok(sel.includes(a), `Select has ${a}`)
}
ok('Select a11y surface')
console.log(`\n${n} passed`)
