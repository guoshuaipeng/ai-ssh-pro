/** whatsNew menu action toasts using about.whatsNew. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'whatsNew'")
assert.ok(idx >= 0)
assert.match(app.slice(idx, idx + 220), /about\.whatsNew/)
assert.match(app.slice(idx, idx + 220), /showToast\(tg\('about\.whatsNew'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("about.whatsNew': '更新内容'"))
assert.ok(i18n.includes('about.whatsNew') && i18n.includes("What's new"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-whats-new-toast/)
console.log('test-whats-new-toast ok')
