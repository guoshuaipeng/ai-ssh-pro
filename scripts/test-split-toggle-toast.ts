/** Menu toggleSplit toasts on/off like statusbar. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'toggleSplit'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 900)
assert.match(block, /sb\.splitOn/)
assert.match(block, /sb\.splitOff/)
assert.match(block, /sb\.splitOffAlsoBroadcast/)
assert.match(block, /showToast\(tg\('sb\.splitOn'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sb.splitOn': '分屏中'"))
assert.ok(i18n.includes("sb.splitOn': 'Split on'"))
assert.ok(i18n.includes("sb.splitOff': '已退出分屏'"))
assert.ok(i18n.includes("sb.splitOff': 'Split view off'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.41')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-split-toggle-toast/)
console.log('test-split-toggle-toast ok')
