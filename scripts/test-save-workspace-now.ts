/** File/CmdK save workspace now (manual flush of last-layout snapshot). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'
import { snapshotWorkspace } from '../src/shared/session-restore'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'saveWorkspaceNow')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /保存工作区/)
assert.match(item.label.en.toLowerCase(), /save workspace/)

const snap = snapshotWorkspace(
  [
    { view: undefined, kind: 'ssh', profileId: 'p1', title: 'host', customTitle: '', pinned: false, sessionId: 's1' },
  ] as never,
  null
)
assert.ok(Array.isArray(snap))

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'saveWorkspaceNow'/)
assert.match(app, /saveLastWorkspace/)
assert.match(app, /ws\.savedNow/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ws.savedNow'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-save-workspace-now/)
console.log('test-save-workspace-now ok')
