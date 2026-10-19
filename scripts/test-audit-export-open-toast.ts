/** exportAudit shows opening toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'exportAudit'")
assert.ok(idx >= 0)
assert.match(app.slice(idx, idx + 450), /audit\.exportOpen/)
assert.match(app.slice(idx, idx + 450), /showToast\(tg\('audit\.exportOpen'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("audit.exportOpen': '打开审计导出…'"))
assert.ok(i18n.includes("audit.exportOpen': 'Opening audit export…'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.61')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-audit-export-open-toast/)
console.log('test-audit-export-open-toast ok')
