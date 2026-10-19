/** quickConnectRecent toasts when filling form without saved profile. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const quickConnectRecent')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 1400)
assert.match(chunk, /openConnectionEditor\(\)/)
assert.match(chunk, /showToast\(tg\('recent\.needCreds'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("recent.needCreds': '已填入最近连接，请补全密码或密钥'"))
assert.ok(i18n.includes("recent.needCreds': 'Filled from recent — enter password or key'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-recent-need-creds-toast/)
console.log('test-recent-need-creds-toast ok')
