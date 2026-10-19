/** Diff actions: need-tab toast is action-specific. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /l8b\.needDiffExplain/)
assert.match(app, /l8b\.needDiffPlaybook/)
assert.match(app, /action === 'explainDiff' \? 'l8b\.needDiffExplain' : 'l8b\.needDiffPlaybook'/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("l8b.needDiffExplain': '解释差异前请先打开一个差异标签'"))
assert.ok(i18n.includes("l8b.needDiffPlaybook': '生成修复剧本前请先打开一个差异标签'"))
assert.ok(i18n.includes("l8b.needDiffExplain': 'Open a diff tab before explaining the diff'"))
assert.ok(i18n.includes("l8b.needDiffPlaybook': 'Open a diff tab before creating a fix playbook'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.43')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-need-diff-toast-action/)
console.log('test-need-diff-toast-action ok')
