/** reconnectAllDropped toasts when already busy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'reconnectAllDropped'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 550)
assert.match(chunk, /if \(reconnectAllBusy\) \{\s*showToast\(tg\('palette\.reconnectAllBusy'\)\)/)
assert.match(chunk, /palette\.needDropped/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.7.0')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reconnect-all-busy-toast/)
console.log('test-reconnect-all-busy-toast ok')
