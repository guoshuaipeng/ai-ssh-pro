/** applyImport toasts when no import preview. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const applyImport')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /if \(!importPreview\) \{\s*showToast\(tg\('n2\.empty'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes('n2.empty'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-apply-import-empty-toast/)
console.log('test-apply-import-empty-toast ok')
