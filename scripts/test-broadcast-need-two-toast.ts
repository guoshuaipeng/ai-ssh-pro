/** toggleBroadcast toasts when fewer than 2 live sessions. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'toggleBroadcast'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 650)
assert.match(chunk, /live\.length < 2/)
assert.match(chunk, /showToast\(tg\('x3\.needTwo'\)\)/)
assert.match(chunk, /setBroadcastPickerOpen\(true\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes('x3.needTwo'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-broadcast-need-two-toast/)
console.log('test-broadcast-need-two-toast ok')
