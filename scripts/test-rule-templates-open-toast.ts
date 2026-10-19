/** enableRuleTemplates opens with toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'enableRuleTemplates'")
assert.ok(idx >= 0)
assert.match(app.slice(idx, idx + 250), /l2c\.templatesOpen/)
assert.match(app.slice(idx, idx + 250), /showToast\(tg\('l2c\.templatesOpen'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l2c.templatesOpen': '打开告警规则模板…'"))
assert.ok(i18n.includes("l2c.templatesOpen': 'Opening alert rule templates…'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-rule-templates-open-toast/)
console.log('test-rule-templates-open-toast ok')
