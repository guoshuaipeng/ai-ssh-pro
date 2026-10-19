/** closeOtherTabs / closeTabsToRight empty + success toasts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /tab\.closeOthersDisabled/)
assert.match(app, /tab\.closedOthersToast/)
assert.match(app, /tab\.closeRightDisabled/)
assert.match(app, /tab\.closedRightToast/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("tab.closeOthersDisabled': '没有可关闭的其他标签'"))
assert.ok(i18n.includes("tab.closeOthersDisabled': 'No other tabs to close'"))
assert.ok(i18n.includes("tab.closedOthersToast': '已关闭 {n} 个其他标签'"))
assert.ok(i18n.includes("tab.closedOthersToast': 'Closed {n} other tab(s)'"))
assert.ok(i18n.includes("tab.closedRightToast': '已关闭右侧 {n} 个标签'"))
assert.ok(i18n.includes("tab.closedRightToast': 'Closed {n} tab(s) to the right'"))
assert.ok(i18n.includes("tab.closeRightDisabled': '右侧没有标签'"))
assert.ok(i18n.includes("tab.closeRightDisabled': 'No tabs to the right'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.51')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-close-tabs-toast/)
console.log('test-close-tabs-toast ok')
