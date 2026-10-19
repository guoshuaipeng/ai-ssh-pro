/** Batch connect done/summary toasts list host labels. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes("tg('l10.done', { n: summary.ok, hosts: fmtHosts(okLabels) })"))
assert.ok(app.includes("hosts: fmtHosts(failLabels)"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l10.done': '已连接 {n} 台（{hosts}）'"))
assert.ok(i18n.includes("l10.summary': '已连接 {ok} 台，{fail} 台失败（{hosts}）'"))
assert.ok(i18n.includes("l10.done': 'Connected {n} hosts ({hosts})'"))
assert.ok(i18n.includes("l10.summary': 'Connected {ok}, {fail} failed ({hosts})'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-batch-connect-toast-hosts/)
console.log('test-batch-connect-toast-hosts ok')
