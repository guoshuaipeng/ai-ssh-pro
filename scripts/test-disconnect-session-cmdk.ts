/** CmdK disconnect current session with confirm. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'
import { CONFIRM_WHITELIST } from '../src/shared/confirm-whitelist'

assert.ok(CONFIRM_WHITELIST.has('confirm.disconnectSession'))

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'disconnectSession')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /断开/)
assert.match(item.label.en.toLowerCase(), /disconnect/)
assert.ok(item.needsSession)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'disconnectSession'/)
assert.match(app, /confirm\.disconnectSession/)
assert.match(app, /ssh\.disconnect/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'confirm.disconnectSession'"))
assert.ok(i18n.includes("'sess.disconnectedToast'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.44')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-disconnect-session-cmdk/)
console.log('test-disconnect-session-cmdk ok')
