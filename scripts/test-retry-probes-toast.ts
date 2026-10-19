/** retryFailedProbes: toast when home closed or no failed probes. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const i = app.indexOf("action === 'retryFailedProbes'")
assert.ok(i >= 0)
const block = app.slice(i, i + 500)
assert.match(block, /l7b\.needHome/)
assert.match(block, /l7c\.noFails/)
assert.match(block, /showToast/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-retry-probes-toast/)
console.log('test-retry-probes-toast ok')
