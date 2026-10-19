/** toggleTabPin toasts when no active tab. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'toggleTabPin'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /if \(!tab\) \{\s*showToast\(tg\('tab\.none'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-toggle-tab-pin-empty-toast/)
console.log('test-toggle-tab-pin-empty-toast ok')
