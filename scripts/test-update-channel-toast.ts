/** updateChannel menu opens about settings with a toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'updateChannel'[\s\S]{0,200}showToast\(tg\('about\.updatesOpened'\)\)/)
assert.match(app, /openUnifiedSettings\('about'\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("about.updatesOpened': '已打开更新通道设置'"))
assert.ok(i18n.includes("about.updatesOpened': 'Opened update channel settings'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-update-channel-toast/)
console.log('test-update-channel-toast ok')
