/** CmdK/menu: Edit session note opens connection form focused on note. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const session = SHARED_MENUS.find((m) => m.id === 'session')
const item = session?.items.find((it) => it.type === 'item' && it.id === 'editSessionNote')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /备注/)
assert.match(item.label.en.toLowerCase(), /note/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'editSessionNote'|editSessionNote'/)
assert.match(app, /'note'/)

const modal = readFileSync('src/renderer/src/components/ConnectionConfigModal.tsx', 'utf8')
assert.match(modal, /focusSection !== 'note'/)
assert.match(modal, /noteRef/)
assert.match(modal, /conn-session-note/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-edit-session-note/)
console.log('test-edit-session-note ok')
