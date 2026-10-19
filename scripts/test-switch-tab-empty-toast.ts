/** switchTab: toast when no tabs open. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const i = app.indexOf("action === 'switchTab'")
assert.ok(i >= 0)
const block = app.slice(i, i + 450)
assert.match(block, /tabsRef\.current\.length/)
assert.match(block, /tab\.none/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-switch-tab-empty-toast/)
console.log('test-switch-tab-empty-toast ok')
