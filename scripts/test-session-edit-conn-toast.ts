/** Session context menu edit connection opens with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("id === 'edit'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 220)
assert.match(chunk, /openConnectionEditor\(p\)/)
assert.match(chunk, /showToast\(tg\('pf5\.editConn'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-session-edit-conn-toast/)
console.log('test-session-edit-conn-toast ok')
