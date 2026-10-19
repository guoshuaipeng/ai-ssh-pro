/** Session/CmdK: file history snapshots (handler + Ctrl+H scope existed). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'
import { KEYMAP_ACTION_ALIAS } from '../src/shared/keymap'

assert.equal(KEYMAP_ACTION_ALIAS.fileHistory, 'fileSnapshots')

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'fileSnapshots')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /历史|快照/)
assert.match(item.label.en.toLowerCase(), /history|snapshot/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'fileSnapshots'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.46')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-file-snapshots-cmdk/)
console.log('test-file-snapshots-cmdk ok')
