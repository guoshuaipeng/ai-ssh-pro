/** toggleLanguage toasts new locale via toolbar.localeTitle. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'toggleLanguage'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 320)
assert.match(block, /toolbar\.localeTitle/)
assert.match(block, /showToast\(tg\('toolbar\.localeTitle'/)
assert.match(block, /English/)
assert.match(block, /中文/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("toolbar.localeTitle': '界面语言：{locale}'"))
assert.ok(i18n.includes("toolbar.localeTitle': 'Interface language: {locale}'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.52')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-toggle-language-toast/)
console.log('test-toggle-language-toast ok')
