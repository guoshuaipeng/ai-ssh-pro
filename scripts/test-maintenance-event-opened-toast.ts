/** aiss-maintenance-open event opens panel with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("aiss-maintenance-open")
assert.ok(start >= 0)
const chunk = app.slice(start - 220, start + 80)
assert.match(chunk, /openMaintenance\(detail\?\.hostKeys\)/)
assert.match(chunk, /showToast\(tg\('l2d\.open'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-maintenance-event-opened-toast/)
console.log('test-maintenance-event-opened-toast ok')
