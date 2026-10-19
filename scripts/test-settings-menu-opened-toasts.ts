/** ai / terminalPrefs / uiTheme menus toast when opening settings. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'ai' || action === 'terminalPrefs' || action === 'uiTheme'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 450)
assert.match(chunk, /settings\.aiOpened/)
assert.match(chunk, /settings\.terminalOpened/)
assert.match(chunk, /settings\.themeOpened/)
assert.match(chunk, /showToast/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("settings.aiOpened': '已打开 AI 设置'"))
assert.ok(i18n.includes("settings.aiOpened': 'Opened AI settings'"))
assert.ok(i18n.includes("settings.terminalOpened': '已打开终端外观设置'"))
assert.ok(i18n.includes("settings.terminalOpened': 'Opened terminal appearance settings'"))
assert.ok(i18n.includes("settings.themeOpened': '已打开界面主题设置'"))
assert.ok(i18n.includes("settings.themeOpened': 'Opened UI theme settings'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-settings-menu-opened-toasts/)
console.log('test-settings-menu-opened-toasts ok')
