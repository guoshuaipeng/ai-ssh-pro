/** stopRecording toasts when nothing is recording. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const stopRecording')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 280)
assert.match(chunk, /if \(!recordingSessionId\) \{\s*showToast\(tg\('sess\.notRecording'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sess.notRecording': '当前没有进行中的录制'"))
assert.ok(i18n.includes("sess.notRecording': 'No recording in progress'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-stop-recording-empty-toast/)
console.log('test-stop-recording-empty-toast ok')
