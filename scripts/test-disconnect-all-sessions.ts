/** CmdK disconnect all connected sessions with confirm. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'
import { CONFIRM_WHITELIST } from '../src/shared/confirm-whitelist'

assert.ok(CONFIRM_WHITELIST.has('confirm.disconnectAllSessions'))

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'disconnectAllSessions')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /断开全部|全部/)
assert.match(item.label.en.toLowerCase(), /disconnect all/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'disconnectAllSessions'/)
assert.match(app, /confirm\.disconnectAllSessions/)
assert.match(app, /sess\.disconnectedAllToast/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'confirm.disconnectAllSessions'"))
assert.ok(i18n.includes("'sess.disconnectedAllToast'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-disconnect-all-sessions/)
console.log('test-disconnect-all-sessions ok')
