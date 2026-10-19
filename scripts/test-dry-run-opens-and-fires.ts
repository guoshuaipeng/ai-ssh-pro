/** dryRunPlaybook: opening run tab also dispatches aiss-dry-run. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const i = app.indexOf("action === 'dryRunPlaybook'")
assert.ok(i >= 0)
const block = app.slice(i, i + 700)
assert.match(block, /openM2\('playbook-run'/)
assert.match(block, /aiss-dry-run'\)\), 120/)
assert.equal((block.match(/aiss-dry-run/g) || []).length, 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-dry-run-opens-and-fires/)
console.log('test-dry-run-opens-and-fires ok')
