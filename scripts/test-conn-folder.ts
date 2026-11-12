/**
 * 新建/编辑连接可选分组；默认未分组；侧栏未分组以分组层级展示。
 * Run: npx tsx --tsconfig tsconfig.web.json scripts/test-conn-folder.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const modal = readFileSync('src/renderer/src/components/ConnectionConfigModal.tsx', 'utf8')
assert.match(modal, /testId="conn-folder"/)
assert.match(modal, /tg\('conn\.folder'\)/)
assert.match(modal, /tg\('app\.ungrouped'\)/)
assert.match(modal, /setFolderId/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /formFolderId/)
assert.match(app, /setFormFolderId/)
assert.match(app, /UNGROUPED_FOLDER_ID/)
assert.match(app, /data-testid="ungrouped-folder"/)
assert.match(app, /data-testid="ungrouped-folder-row"/)
assert.match(app, /renderProfileBranch\(p, true\)/)
assert.match(app, /chosenFolderId/)
assert.match(app, /folders=\{folders\}/)
assert.match(app, /folderId=\{formFolderId\}/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'conn\.folder': '分组'/)
assert.match(i18n, /'conn\.folder': 'Group'/)
assert.match(i18n, /'conn\.folderHint'/)

console.log('test-conn-folder ok')
