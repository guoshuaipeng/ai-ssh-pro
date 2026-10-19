/** renameFolder toasts when folder id is gone. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf('const renameFolder')
assert.ok(start >= 0)
const chunk = app.slice(start, start + 400)
assert.match(chunk, /app\.folderMissing/)
assert.match(chunk, /showToast\(tg\('app\.folderMissing'\)\)/)
assert.match(chunk, /folders\.find\(\(f\) => f\.id === folderId\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-rename-folder-missing-toast/)
console.log('test-rename-folder-missing-toast ok')
