/** S4 copy command button toasts on clipboard write. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('data-testid="s4-copy"')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 450)
assert.match(chunk, /clipboard\.writeText\(roBlock\.command\)/)
assert.match(chunk, /showToast\(tg\('ctx\.copied'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-s4-copy-cmd-toast/)
console.log('test-s4-copy-cmd-toast ok')
