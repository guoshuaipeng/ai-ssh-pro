/** refreshHomeHealth: toast when Ops home is not open. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const i = app.indexOf("action === 'refreshHomeHealth'")
assert.ok(i >= 0)
const block = app.slice(i, i + 350)
assert.match(block, /l7b\.needHome/)
assert.match(block, /showToast/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-refresh-home-health-toast/)
console.log('test-refresh-home-health-toast ok')
