/** openPostmortem toasts when opening alert postmortem. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const openPostmortem')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 700)
assert.match(chunk, /openM2\('postmortem'/)
assert.match(chunk, /showToast\(tg\('w4\.opened'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("w4.opened': '已打开告警复盘'"))
assert.ok(i18n.includes("w4.opened': 'Opened alert postmortem'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-postmortem-opened-toast/)
console.log('test-postmortem-opened-toast ok')
