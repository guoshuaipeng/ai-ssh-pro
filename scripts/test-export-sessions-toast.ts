/** exportJson/Openssh toast on success and failure. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'exportJson' || action === 'exportOpenssh'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 550)
assert.match(chunk, /showToast\(tg\('exp\.copied', \{ format \}\)\)/)
assert.match(chunk, /showToast\(msg, \{ kind: 'error' \}\)/)
assert.match(chunk, /setSideInfo\(tg\('exp\.copied', \{ format \}\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-export-sessions-toast/)
console.log('test-export-sessions-toast ok')
