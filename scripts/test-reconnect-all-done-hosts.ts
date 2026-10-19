/** reconnectAllDropped finished toast lists hosts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /palette\.reconnectedAll',[\s\S]*?hosts/)
assert.match(app, /palette\.reconnectAllFailed',[\s\S]*?hosts/)
assert.ok(app.includes("tg('palette.reconnectedAll', { n: okCount, total: dropped.length, hosts })"))
assert.ok(app.includes("tg('palette.reconnectAllFailed', { n: dropped.length, hosts })"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("palette.reconnectedAll': '已重连 {n}/{total} 个会话（{hosts}）'"))
assert.ok(i18n.includes("palette.reconnectAllFailed': '未能重连 {n} 个已断开会话（{hosts}）'"))
assert.ok(i18n.includes("palette.reconnectedAll': 'Reconnected {n}/{total} sessions ({hosts})'"))
assert.ok(i18n.includes("palette.reconnectAllFailed': 'Could not reconnect {n} dropped session(s) ({hosts})'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reconnect-all-done-hosts/)
console.log('test-reconnect-all-done-hosts ok')
