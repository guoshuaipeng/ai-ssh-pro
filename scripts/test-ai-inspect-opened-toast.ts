/** aiInspect menu opens inspect dialog with a toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'aiInspect'[\s\S]{0,180}showToast\(tg\('inspect\.opened'\)\)/)
assert.match(app, /setInspectOpen\(true\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("inspect.opened': '已打开多主机巡检报告'"))
assert.ok(i18n.includes("inspect.opened': 'Opened multi-host inspection'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.42')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-inspect-opened-toast/)
console.log('test-ai-inspect-opened-toast ok')
