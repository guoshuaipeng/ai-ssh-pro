/** Session context menu toolbox opens with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("id === 'toolbox'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /openToolTabRef\.current\('toolbox'/)
assert.match(chunk, /showToast\(tg\('ctx\.toolbox'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.55')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-session-toolbox-opened-toast/)
console.log('test-session-toolbox-opened-toast ok')
