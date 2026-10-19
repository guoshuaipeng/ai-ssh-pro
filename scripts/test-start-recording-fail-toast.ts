/** startRecording toasts on failure (not only setError). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const startRecording')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 900)
assert.match(chunk, /setError\(tg\('app\.recordFail'\)\)/)
assert.match(chunk, /showToast\(tg\('app\.recordFail'\), \{ kind: 'error' \}\)/)
assert.match(chunk, /sess\.recordingStarted/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-start-recording-fail-toast/)
console.log('test-start-recording-fail-toast ok')
