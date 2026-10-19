/** addFolder shows created toast with name. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /app\.folderCreated/)
assert.match(app, /showToast\(tg\('app\.folderCreated', \{ name \}\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("app.folderCreated': '已新建分组「{name}」'"))
assert.ok(i18n.includes("app.folderCreated': 'Created group"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.51')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-folder-created-toast/)
console.log('test-folder-created-toast ok')
