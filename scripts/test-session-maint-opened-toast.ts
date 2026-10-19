/** Session context menu maintenance opens with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("id === 'maint'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 220)
assert.match(chunk, /openMaintenance\(multi \?\? \[p\.id\]\)/)
assert.match(chunk, /showToast\(tg\('l2d\.open'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.43')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-session-maint-opened-toast/)
console.log('test-session-maint-opened-toast ok')
