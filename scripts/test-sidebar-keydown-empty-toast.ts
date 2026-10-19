/** Sidebar Enter/F2/Delete with no selection toasts l10.none. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const onSidebarKeyDown')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 550)
assert.match(chunk, /if \(!p\) \{/)
assert.match(chunk, /showToast\(tg\('l10\.none'\)\)/)
assert.match(chunk, /e\.key === 'Enter' \|\| e\.key === 'F2'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.48')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sidebar-keydown-empty-toast/)
console.log('test-sidebar-keydown-empty-toast ok')
