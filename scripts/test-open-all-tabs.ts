/** All-tabs dropdown always available + CmdK openAllTabs. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'openAllTabs')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /全部/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /openAllTabsMenu/)
assert.match(app, /action === 'openAllTabs'/)
assert.match(app, /tabs\.length > 0/)
assert.match(app, /tab\.allTabs/)
assert.match(app, /tab-overflow-menu/)
assert.match(app, /filterTabList/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'tab.allTabs'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-open-all-tabs/)
console.log('test-open-all-tabs ok')
