/** quickConnectRecent toasts when connecting a matched saved profile. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const quickConnectRecent')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 400)
assert.match(chunk, /showToast\(tg\('recent\.connecting', \{ host: match\.label\?\.trim\(\) \|\| match\.host \}\)\)/)
assert.match(chunk, /connectProfile\(match\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("recent.connecting': '正在连接 {host}…'"))
assert.ok(i18n.includes("recent.connecting': 'Connecting to {host}…'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.7.0')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-recent-connecting-toast/)
console.log('test-recent-connecting-toast ok')
