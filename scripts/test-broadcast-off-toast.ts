/** toggleBroadcast shows toast when turning broadcast off. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'toggleBroadcast'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 450)
assert.match(block, /sb\.broadcastOff/)
assert.match(block, /showToast\(tg\('sb\.broadcastOff'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sb.broadcastOff': '已关闭广播'"))
assert.ok(i18n.includes("sb.broadcastOff': 'Broadcast off'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-broadcast-off-toast/)
console.log('test-broadcast-off-toast ok')
