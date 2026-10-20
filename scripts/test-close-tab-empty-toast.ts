/** closeTab toasts tab.none when no active tab. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'closeTab'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 400)
assert.match(block, /tab\.none/)
assert.match(block, /if \(!tab\)/)
assert.match(block, /closeTabRef/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("tab.none': '未打开会话'"))
assert.ok(i18n.includes("tab.none': 'No session open'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-close-tab-empty-toast/)
console.log('test-close-tab-empty-toast ok')
