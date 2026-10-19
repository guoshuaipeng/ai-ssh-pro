/** opsHome / maintOpen / syncConflicts open toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const home = app.indexOf("action === 'opsHome'")
const maint = app.indexOf("action === 'maintOpen'")
const sync = app.indexOf("action === 'syncConflicts'")
assert.ok(home >= 0 && maint >= 0 && sync >= 0)
assert.match(app.slice(home, home + 180), /showToast\(tg\('l7\.title'\)\)/)
assert.match(app.slice(maint, maint + 200), /showToast\(tg\('l2d\.open'\)\)/)
assert.match(app.slice(sync, sync + 220), /showToast\(tg\('m2\.conflicts'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l7.title': '运维首页'"))
assert.ok(i18n.includes("l2d.open': '维护窗口'"))
assert.ok(i18n.includes("m2.conflicts': '同步冲突'"))
assert.ok(i18n.includes("l7.title': 'Home'"))
assert.ok(i18n.includes("l2d.open': 'Maintenance window'"))
assert.ok(i18n.includes("m2.conflicts': 'Sync conflicts'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.48')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ops-home-maint-conflicts-toast/)
console.log('test-ops-home-maint-conflicts-toast ok')
