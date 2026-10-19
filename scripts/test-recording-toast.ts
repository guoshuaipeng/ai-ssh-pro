/** Session recording start/stop toasts with host. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /sess\.recordingStarted/)
assert.match(app, /sess\.recordingStopped/)
assert.match(app, /toolbar\.needSession/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sess.recordingStarted': '开始录制 {host}'"))
assert.ok(i18n.includes("sess.recordingStarted': 'Recording started · {host}'"))
assert.ok(i18n.includes("sess.recordingStopped': '已停止录制 {host}'"))
assert.ok(i18n.includes("sess.recordingStopped': 'Recording stopped · {host}'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.51')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-recording-toast/)
console.log('test-recording-toast ok')
