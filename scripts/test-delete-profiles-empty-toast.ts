/** deleteProfilesFn toasts when no ids selected. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('deleteProfilesFn = useCallback')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /if \(!ids\.length\) \{\s*showToast\(tg\('l10\.none'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-delete-profiles-empty-toast/)
console.log('test-delete-profiles-empty-toast ok')
