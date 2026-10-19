/** maintEnd ends single active window or opens panel. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'maintEnd')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /结束|维护/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'maintEnd'/)
assert.match(app, /endMaintenance/)
assert.match(app, /l2d\.noneActive/)
assert.match(app, /l2d\.pickEnd/)
assert.match(app, /from '@shared\/maintenance'/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l2d.noneActive': '当前没有进行中的维护窗口'"))
assert.ok(i18n.includes("l2d.noneActive': 'No active maintenance window'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.54')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-maint-end-action/)
console.log('test-maint-end-action ok')
