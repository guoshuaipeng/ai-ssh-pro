/** Alert actions: need-alert toasts are action-specific. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /w1\.needAlertForPostmortem/)
assert.match(app, /w1\.needAlertWorkbench/)
assert.match(app, /action === 'aiPostmortem'/)
assert.match(app, /action === 'exportPostmortem'/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("w1.needAlertForPostmortem': 'AI 复盘需要一条告警"))
assert.ok(i18n.includes("w1.needAlertWorkbench': '导出复盘前请先打开告警工作台'"))
assert.ok(i18n.includes("w1.needAlertForPostmortem': 'AI postmortem needs a selected alert"))
assert.ok(i18n.includes("w1.needAlertWorkbench': 'Open the alert workbench before exporting a postmortem'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.52')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-need-alert-toast-action/)
console.log('test-need-alert-toast-action ok')
