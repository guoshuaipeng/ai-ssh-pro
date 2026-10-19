/** editProfileTags toasts when profile is gone. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const editProfileTags')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 320)
assert.match(chunk, /if \(!cur\) \{\s*showToast\(tg\('l10\.missing'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.42')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-edit-tags-missing-toast/)
console.log('test-edit-tags-missing-toast ok')
