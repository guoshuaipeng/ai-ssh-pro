/** toggleSplit toasts when fewer than 2 live sessions. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'toggleSplit'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 750)
assert.match(chunk, /sb\.splitNeedTwo/)
assert.match(chunk, /live\.length < 2/)
assert.match(chunk, /showToast\(tg\('sb\.splitOn'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sb.splitNeedTwo': '至少需要 2 个会话才能分屏'"))
assert.ok(i18n.includes("sb.splitNeedTwo': 'Need at least 2 sessions to split'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.52')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-split-need-two-toast/)
console.log('test-split-need-two-toast ok')
