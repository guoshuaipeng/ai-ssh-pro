/** moveProfileToFolder toasts into folder / ungrouped. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /app\.movedToFolder/)
assert.match(app, /app\.movedToUngrouped/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("app.movedToFolder': '已将 {n} 台主机移入「{name}」'"))
assert.ok(i18n.includes("app.movedToFolder': 'Moved {n} host(s) into"))
assert.ok(i18n.includes("app.movedToUngrouped': '已将 {n} 台主机移出分组'"))
assert.ok(i18n.includes("app.movedToUngrouped': 'Moved {n} host(s) out of groups'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.42')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-move-folder-toast/)
console.log('test-move-folder-toast ok')
