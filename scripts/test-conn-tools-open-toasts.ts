/** Connection/settings/tool open toasts via unused i18n keys. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const checks: [string, string][] = [
  ['knownHosts', 'kh.title'],
  ['startupSettings', 'menu.startupSettings'],
  ['connection', 'toolbar.newConn'],
  ['portForward', 'tab.forward'],
  ['resourceMonitor', 'g3.monitor'],
  ['batchExec', 'ctx.batch'],
  ['serverTools', 'ctx.toolbox'],
  ['commandPalette', 'toolbar.searchFeatures'],
]
for (const [action, key] of checks) {
  const idx = app.indexOf(`action === '${action}'`)
  assert.ok(idx >= 0, action)
  assert.match(app.slice(idx, idx + 280), new RegExp(key.replace(/\./g, '\\.')))
}

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("kh.title': '主机密钥与本机密钥'"))
assert.ok(i18n.includes("menu.startupSettings': '启动设置…'"))
assert.ok(i18n.includes("toolbar.newConn': '新建连接'"))
assert.ok(i18n.includes("tab.forward': '端口转发'"))
assert.ok(i18n.includes("g3.monitor': '打开监控'"))
assert.ok(i18n.includes("ctx.batch': '批量执行…'"))
assert.ok(i18n.includes("ctx.toolbox': '服务器工具箱'"))
assert.ok(i18n.includes("toolbar.searchFeatures': '搜索功能…'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-conn-tools-open-toasts/)
console.log('test-conn-tools-open-toasts ok')
