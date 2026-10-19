/** deleteFolder toasts when folder id is gone. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const deleteFolder')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 350)
assert.match(chunk, /if \(!folder\) \{\s*showToast\(tg\('app\.folderMissing'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("app.folderMissing': '找不到该分组'"))
assert.ok(i18n.includes("app.folderMissing': 'That group is no longer in the list'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.36')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-delete-folder-missing-toast/)
console.log('test-delete-folder-missing-toast ok')
