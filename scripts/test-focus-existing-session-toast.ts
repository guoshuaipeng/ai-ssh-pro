/** openOrFocusProfile toasts when switching to an open session. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const openOrFocusProfile = useCallback')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 450)
assert.match(chunk, /setActiveTabId\(live\.tabId\)/)
assert.match(chunk, /showToast\(tg\('sess\.focusedExisting'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sess.focusedExisting': '已切换到已打开的会话'"))
assert.ok(i18n.includes("sess.focusedExisting': 'Switched to open session'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.52')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-focus-existing-session-toast/)
console.log('test-focus-existing-session-toast ok')
