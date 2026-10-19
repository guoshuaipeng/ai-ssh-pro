/** openFileHistory toasts when opening version history. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const openFileHistory')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 700)
assert.match(chunk, /openM2\('file-history'/)
assert.match(chunk, /showToast\(tg\('w3\.history'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-file-history-opened-toast/)
console.log('test-file-history-opened-toast ok')
