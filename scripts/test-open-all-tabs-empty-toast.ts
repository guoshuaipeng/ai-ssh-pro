/** openAllTabs toasts tab.none when no tabs (like switchTab). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'openAllTabs'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 280)
assert.match(block, /tabsRef\.current\.length/)
assert.match(block, /tab\.none/)
assert.match(block, /openAllTabsMenu/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("tab.none': '未打开会话'"))
assert.ok(i18n.includes("tab.none': 'No session open'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-open-all-tabs-empty-toast/)
console.log('test-open-all-tabs-empty-toast ok')
