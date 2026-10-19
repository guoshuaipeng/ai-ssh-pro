/** snippets / reconnectPolicy open toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const s = app.indexOf("action === 'snippets'")
const r = app.indexOf("action === 'reconnectPolicy'")
assert.ok(s >= 0 && r >= 0)
assert.match(app.slice(s, s + 220), /menu\.snippets/)
assert.match(app.slice(r, r + 280), /l9\.section/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("menu.snippets': '命令片段'") || i18n.includes("menu.snippets': 'Snippets'"))
assert.ok(i18n.includes("l9.section': '重连策略'"))
assert.ok(i18n.includes("l9.section': 'Reconnect policy'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.40')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-snippets-reconnect-toast/)
console.log('test-snippets-reconnect-toast ok')
