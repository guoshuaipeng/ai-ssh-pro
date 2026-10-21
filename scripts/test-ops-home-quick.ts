import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sp = readFileSync('src/renderer/src/components/ScopePicker.tsx', 'utf8')
// OH2: scope picker has no native select; custom scope uses toggle chips
assert.ok(!/<select/.test(sp), 'no native select in ScopePicker')
assert.match(sp, /testId="scope-mode"/)
assert.match(sp, /aria-pressed=\{on\}/)

const oh = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
const quick = oh.slice(oh.indexOf('const quick = ('), oh.indexOf('</Section>', oh.indexOf('const quick = (')))
assert.ok(!/variant="ghost"/.test(quick), 'quick area uses one button style')
assert.match(quick, /data-testid="oh-quick-recent"/)
const tile = oh.slice(oh.indexOf('<div className="oh-tile-actions"'), oh.indexOf('</div>', oh.indexOf('<div className="oh-tile-actions"')))
assert.equal((tile.match(/variant="secondary"/g) || []).length, 3, 'terminal / SFTP / monitor share one style')
assert.equal(JSON.parse(readFileSync('scripts/native-select-baseline.json', 'utf8')).count, 31)
console.log('test-ops-home-quick ok')
