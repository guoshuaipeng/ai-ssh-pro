/** stopRecording catch path toasts the error. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const stopRecording')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 800)
assert.match(chunk, /stopRecording\(recordingSessionId\)/)
assert.match(chunk, /\} catch \(e\) \{\s*const msg = e instanceof Error \? e\.message : String\(e\)/)
assert.match(chunk, /setError\(msg\)/)
assert.match(chunk, /showToast\(msg, \{ kind: 'error' \}\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-stop-recording-catch-toast/)
console.log('test-stop-recording-catch-toast ok')
