/** broadcastTargets toasts when fewer than 2 live sessions. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'broadcastTargets'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 450)
assert.match(chunk, /live\.length < 2/)
assert.match(chunk, /showToast\(tg\('x3\.needTwo'\)\)/)
assert.match(chunk, /menu\.broadcastTargets/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-broadcast-targets-need-two-toast/)
console.log('test-broadcast-targets-need-two-toast ok')
