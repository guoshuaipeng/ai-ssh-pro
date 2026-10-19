/** monitorProfile toasts when opening resource monitor. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const monitorProfile')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /setSessionMenu\(null\)/)
assert.match(chunk, /showToast\(tg\('g3\.monitor'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-monitor-profile-toast/)
console.log('test-monitor-profile-toast ok')
