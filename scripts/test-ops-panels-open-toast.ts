/** alert/dashboard panel opens toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
for (const [action, key] of [
  ['alertHistory', 'o2.historyTitle'],
  ['alertRules', 'o2.rulesTitle'],
  ['alertWorkbench', 'l7.openWorkbench'],
  ['dashboard', 'l7.openDashboard'],
] as const) {
  const idx = app.indexOf(`action === '${action}'`)
  assert.ok(idx >= 0, action)
  assert.match(app.slice(idx, idx + 320), new RegExp(key.replace('.', '\\.')))
}

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l7.openDashboard': '打开看板'"))
assert.ok(i18n.includes("l7.openDashboard': 'Open dashboard'"))
assert.ok(i18n.includes("l7.openWorkbench': '打开告警工作台'"))
assert.ok(i18n.includes("l7.openWorkbench': 'Open alert workbench'"))
assert.ok(i18n.includes("o2.historyTitle': '告警历史'"))
assert.ok(i18n.includes("o2.historyTitle': 'Alert history'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.40')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ops-panels-open-toast/)
console.log('test-ops-panels-open-toast ok')
