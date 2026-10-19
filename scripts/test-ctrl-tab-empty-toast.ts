/** Ctrl+Tab with no tabs toasts tab.none. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const list = tabsRef.current')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 320)
assert.match(chunk, /if \(!list\.length\) \{/)
assert.match(chunk, /e\.key === 'Tab'/)
assert.match(chunk, /showToast\(tg\('tab\.none'\)\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.62')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ctrl-tab-empty-toast/)
console.log('test-ctrl-tab-empty-toast ok')
