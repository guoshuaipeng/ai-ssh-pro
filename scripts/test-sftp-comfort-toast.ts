/** sftpComfort menu toggle toasts on/off. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'sftpComfort'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 400)
assert.match(block, /sb\.sftpComfortOn/)
assert.match(block, /sb\.sftpComfortOff/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sb.sftpComfortOn': '已开启 SFTP 舒适密度'"))
assert.ok(i18n.includes("sb.sftpComfortOn': 'SFTP comfort density on'"))
assert.ok(i18n.includes("sb.sftpComfortOff': '已恢复 SFTP 默认密度'"))
assert.ok(i18n.includes("sb.sftpComfortOff': 'SFTP density restored'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.52')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-comfort-toast/)
console.log('test-sftp-comfort-toast ok')
