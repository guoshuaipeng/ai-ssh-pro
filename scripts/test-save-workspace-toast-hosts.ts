/** saveWorkspaceNow toast lists tab titles. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'saveWorkspaceNow'/)
assert.match(app, /ws\.savedNow',\s*\{\s*n:\s*snapshot\.length,\s*hosts\s*\}/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /ws\.savedNow': '工作区已保存（\{n\} 个标签：\{hosts\}）'/)
assert.match(i18n, /ws\.savedNow': 'Workspace saved \(\{n\} tabs: \{hosts\}\)'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-save-workspace-toast-hosts/)
console.log('test-save-workspace-toast-hosts ok')
