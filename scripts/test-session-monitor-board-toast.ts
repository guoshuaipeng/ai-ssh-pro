/** Session context menu monitor board opens with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("id === 'monitorBoard'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 220)
assert.match(chunk, /openDashboard\(\)/)
assert.match(chunk, /showToast\(tg\('l7\.openDashboard'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-session-monitor-board-toast/)
console.log('test-session-monitor-board-toast ok')
