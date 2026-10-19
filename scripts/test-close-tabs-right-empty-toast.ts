/** closeTabsToRight toasts when no active tab. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'closeTabsToRight'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 220)
assert.match(chunk, /if \(!activeTabId\) \{\s*showToast\(tg\('tab\.none'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.62')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-close-tabs-right-empty-toast/)
console.log('test-close-tabs-right-empty-toast ok')
