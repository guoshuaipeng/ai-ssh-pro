/** Session context menu batch opens with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("id === 'batch'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 450)
assert.match(chunk, /openToolTabRef\.current\('batch'/)
assert.match(chunk, /showToast\(tg\('ctx\.batch'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.44')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-session-batch-opened-toast/)
console.log('test-session-batch-opened-toast ok')
