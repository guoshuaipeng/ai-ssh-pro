/** Tools/CmdK: alert rule templates (handler existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'enableRuleTemplates')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /模板|规则/)
assert.match(item.label.en.toLowerCase(), /template|rule/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'enableRuleTemplates'/)
assert.match(app, /rulesSeg:\s*'templates'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-enable-rule-templates-cmdk/)
console.log('test-enable-rule-templates-cmdk ok')
