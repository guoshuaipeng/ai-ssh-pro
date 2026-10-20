/** startRecording catch path toasts the error. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const startRecording')
assert.ok(start >= 0)
const stop = app.indexOf('const stopRecording', start)
const chunk = app.slice(start, stop)
assert.match(chunk, /\} catch \(e\) \{\s*const msg = e instanceof Error \? e\.message : String\(e\)/)
assert.match(chunk, /setError\(msg\)/)
assert.match(chunk, /showToast\(msg, \{ kind: 'error' \}\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-start-recording-catch-toast/)
console.log('test-start-recording-catch-toast ok')
