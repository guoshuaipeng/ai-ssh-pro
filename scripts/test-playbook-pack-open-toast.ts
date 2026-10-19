/** export/import playbook pack menu actions toast when opening. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const ex = app.indexOf("action === 'exportPlaybookPack'")
const im = app.indexOf("action === 'importPlaybookPack'")
assert.ok(ex >= 0 && im >= 0)
assert.match(app.slice(ex, ex + 280), /showToast\(tg\('w5\.export'\)\)/)
assert.match(app.slice(im, im + 220), /showToast\(tg\('w5\.import'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("w5.export': '导出分享包…'"))
assert.ok(i18n.includes("w5.export': 'Export share pack…'"))
assert.ok(i18n.includes("w5.import': '导入分享包…'"))
assert.ok(i18n.includes("w5.import': 'Import share pack…'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-playbook-pack-open-toast/)
console.log('test-playbook-pack-open-toast ok')
