/** Clear audit log shows toast after confirm. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /audit\.cleared/)
assert.match(app, /showToast\(tg\('audit\.cleared'\)\)/)
assert.match(app, /confirm\.clearAudit/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("audit.cleared': '已清空审计日志'"))
assert.ok(i18n.includes("audit.cleared': 'Audit log cleared'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.48')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-audit-cleared-toast/)
console.log('test-audit-cleared-toast ok')
