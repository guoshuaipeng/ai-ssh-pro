/** deleteProfilesFn toasts after confirm. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /app\.profileDeleted/)
assert.match(app, /app\.profilesDeleted/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("app.profileDeleted': '已删除连接「{name}」'"))
assert.ok(i18n.includes("app.profileDeleted': 'Deleted connection"))
assert.ok(i18n.includes("app.profilesDeleted': '已删除 {n} 个连接'"))
assert.ok(i18n.includes("app.profilesDeleted': 'Deleted {n} connection(s)'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-profile-deleted-toast/)
console.log('test-profile-deleted-toast ok')
