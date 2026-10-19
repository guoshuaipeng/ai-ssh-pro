/** monitorProfile toasts when connect fails. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const monitorProfile')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 650)
assert.match(chunk, /const sid = await connectProfile\(p\)/)
assert.match(chunk, /showToast\(tg\('ctx\.connectFailed', \{ reason: tg\('ctx\.seeError'\) \}\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-monitor-profile-connect-fail-toast/)
console.log('test-monitor-profile-connect-fail-toast ok')
