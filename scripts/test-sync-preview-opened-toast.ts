/** Pinning sync preview opens panel with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("openM2('sync-preview'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 350)
assert.match(chunk, /showToast\(tg\('m2\.syncPreview'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sync-preview-opened-toast/)
console.log('test-sync-preview-opened-toast ok')
