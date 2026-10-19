/** Menu reconnect shows host toast when starting. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'reconnect' \|\| action === 'duplicateSession'/)
assert.match(app, /sess\.reconnectStarted/)
assert.match(app, /showToast\(tg\('sess\.reconnectStarted', \{ host \}\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sess.reconnectStarted': '正在重连 {host}"))
assert.ok(i18n.includes("sess.reconnectStarted': 'Reconnecting {host}"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reconnect-toast/)
console.log('test-reconnect-toast ok')
