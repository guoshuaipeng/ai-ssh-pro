/** startRename toasts when tab id is gone. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const startRename = useCallback')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /if \(!tab\) \{\s*showToast\(tg\('tab\.none'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-start-rename-empty-toast/)
console.log('test-start-rename-empty-toast ok')
