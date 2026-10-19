/** copyConnectionString toasts when no tab/profile. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'copyConnectionString'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 450)
assert.match(chunk, /if \(!tab && !profile\) \{\s*showToast\(tg\('l10\.none'\)\)/)
assert.match(chunk, /formatConnectionString/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-copy-conn-empty-toast/)
console.log('test-copy-conn-empty-toast ok')
