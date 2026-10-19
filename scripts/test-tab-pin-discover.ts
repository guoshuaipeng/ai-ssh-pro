/** Tab pin hover affordance + tip strings. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tabMenuItems, type TabMenuCtx } from '../src/shared/inline-menus'

const ctx: TabMenuCtx = {
  pinned: false,
  readOnlyOn: false,
  canDuplicate: true,
  canSessionTools: true,
  canForward: true,
  closeOthersDisabled: false,
  closeRightDisabled: false
}
const items = tabMenuItems(ctx, 'context')
const pin = items.find((n) => n.type === 'item' && n.id === 'pin')
assert.ok(pin && pin.type === 'item')
assert.equal(pin.testId, 'tab-pin')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /tab-pin-btn/)
assert.match(app, /tab\.pinTip/)
assert.match(app, /aiss\.prefs\.tabPinTipShown/)

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(css, /\.tab-pin-btn/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'tab\.pinTip'/)
assert.match(i18n, /'tab\.pinnedToast'/)
assert.match(i18n, /'ai\.testConnection'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-tab-pin-discover/)

console.log('test-tab-pin-discover ok')
