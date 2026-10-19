/** Copy connection string action + formatter. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatConnectionString } from '../src/shared/connection-string'
import { SHARED_MENUS } from '../src/shared/menus'

assert.equal(formatConnectionString({ username: 'ops', host: '10.0.0.1', port: 22 }), 'ops@10.0.0.1:22')
assert.equal(formatConnectionString({ username: 'ops', host: '10.0.0.1', port: 2222 }), 'ops@10.0.0.1:2222')
assert.equal(formatConnectionString({}), 'root@host:22')

const item = SHARED_MENUS.find((m) => m.id === 'session')?.items.find((it) => it.type === 'item' && it.id === 'copyConnectionString')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /连接/)
assert.match(item.label.en.toLowerCase(), /connection/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /copyConnectionString/)
assert.match(app, /formatConnectionString/)
assert.match(app, /navigator\.clipboard\.writeText/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.equal(i18n.includes("'sess.copiedConn'"), true)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string }; version: string }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-copy-connection-string/)
assert.equal(pkg.version, '0.6.50')
console.log('test-copy-connection-string ok')
