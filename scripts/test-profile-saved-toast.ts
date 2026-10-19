/** saveProfile shows saved toast with connection name. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /app\.profileSaved/)
assert.match(app, /showToast\(tg\('app\.profileSaved', \{ name: savedLabel \}\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("app.profileSaved': '已保存连接「{name}」'"))
assert.ok(i18n.includes("app.profileSaved': 'Saved connection"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.44')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-profile-saved-toast/)
console.log('test-profile-saved-toast ok')
