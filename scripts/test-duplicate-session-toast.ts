/** duplicateSession shows host toast when starting. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /sess\.duplicating/)
assert.match(app, /action === 'duplicateSession'/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sess.duplicating': '正在复制会话 {host}…'"))
assert.ok(i18n.includes("sess.duplicating': 'Duplicating session {host}…'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-duplicate-session-toast/)
console.log('test-duplicate-session-toast ok')
