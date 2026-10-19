/** inventory / sftp / folderSync / syncPreview open toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const checks: [string, string][] = [
  ['inventory', 'menu.inventory'],
  ['sftp', 'toolbar.sftpTitle'],
  ['folderSync', 'menu.folderSync'],
  ['syncPreview', 'm2.cloudSync'],
]
for (const [action, key] of checks) {
  const idx = app.indexOf(`action === '${action}'`)
  assert.ok(idx >= 0, action)
  assert.match(app.slice(idx, idx + 900), new RegExp(key.replace(/\./g, '\\.')))
}

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("menu.inventory': '主机档案'"))
assert.ok(i18n.includes("toolbar.sftpTitle': 'SFTP 文件'"))
assert.ok(i18n.includes("menu.folderSync': '同步文件夹…'"))
assert.ok(i18n.includes("m2.cloudSync': '云同步'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-inventory-sftp-sync-toast/)
console.log('test-inventory-sftp-sync-toast ok')
