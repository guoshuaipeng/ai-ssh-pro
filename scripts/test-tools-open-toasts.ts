/** Tools/settings open actions toast with existing menu keys. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const checks: [string, string][] = [
  ['sftpTransferQueue', 'd1.queue'],
  ['auditLog', 'menu.auditLog'],
  ['playbooks', 'm2.playbooks'],
  ['cloudSync', 'm2.cloudSync'],
  ['sessionRecordings', 'menu.sessionRecordings'],
  ['shortcuts', 'menu.shortcuts'],
  ['backup', 'menu.backup'],
  ['broadcastTargets', 'menu.broadcastTargets'],
]
for (const [action, key] of checks) {
  const idx = app.indexOf(`action === '${action}'`)
  assert.ok(idx >= 0, action)
  assert.match(app.slice(idx, idx + 500), new RegExp(key.replace(/\./g, '\\.')))
}

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("menu.auditLog': '审计日志'"))
assert.ok(i18n.includes("menu.sessionRecordings': '会话录制'"))
assert.ok(i18n.includes("menu.shortcuts': '键盘快捷键'"))
assert.ok(i18n.includes("menu.broadcastTargets': '选择广播目标…'"))
assert.ok(i18n.includes("d1.queue': '传输队列'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.62')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-tools-open-toasts/)
console.log('test-tools-open-toasts ok')
