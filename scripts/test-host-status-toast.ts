/** toggleHostStatus shows on/off toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /settings\.hostStatusOn/)
assert.match(app, /settings\.hostStatusOff/)
assert.match(app, /action === 'toggleHostStatus'/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("settings.hostStatusOn': '已显示主机在线状态'"))
assert.ok(i18n.includes("settings.hostStatusOn': 'Host online status shown'"))
assert.ok(i18n.includes("settings.hostStatusOff': '已隐藏主机在线状态'"))
assert.ok(i18n.includes("settings.hostStatusOff': 'Host online status hidden'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-host-status-toast/)
console.log('test-host-status-toast ok')
