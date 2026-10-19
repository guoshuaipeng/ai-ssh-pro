/** openPostmortemAi toasts when opening AI postmortem. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const openPostmortemAi')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 650)
assert.match(chunk, /openM2\('alert-postmortem-ai'/)
assert.match(chunk, /showToast\(tg\('a5\.opened'\)\)/)
assert.match(chunk, /a5\.emptyTl/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("a5.opened': '已打开 AI 复盘摘要'"))
assert.ok(i18n.includes("a5.opened': 'Opened AI postmortem summary'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-postmortem-ai-opened-toast/)
console.log('test-postmortem-ai-opened-toast ok')
