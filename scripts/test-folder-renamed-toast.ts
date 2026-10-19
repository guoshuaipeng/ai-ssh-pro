/** renameFolder shows renamed toast with name. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /app\.folderRenamed/)
assert.match(app, /showToast\(tg\('app\.folderRenamed', \{ name \}\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("app.folderRenamed': '已重命名为「{name}」'"))
assert.ok(i18n.includes("app.folderRenamed': 'Renamed to"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.50')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-folder-renamed-toast/)
console.log('test-folder-renamed-toast ok')
