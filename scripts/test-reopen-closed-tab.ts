/** Reopen last closed tab (Ctrl+Shift+T / CmdK). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { popClosedTab, pushClosedTab, type ClosedTabSnap } from '../src/shared/closed-tabs'
import { SHARED_MENUS } from '../src/shared/menus'
import { KEYMAP } from '../src/shared/keymap'

const snap: ClosedTabSnap = { connectOpts: { host: '10.0.0.1', username: 'ops', port: 22 }, profileId: 'p1' }
let stack = pushClosedTab([], snap)
stack = pushClosedTab(stack, { connectOpts: { host: '10.0.0.2', username: 'root' } })
assert.equal(stack[0]!.connectOpts.host, '10.0.0.2')
const popped = popClosedTab(stack)
assert.equal(popped.snap!.connectOpts.host, '10.0.0.2')
assert.equal(popped.next[0]!.connectOpts.host, '10.0.0.1')

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'reopenClosedTab')
assert.ok(item && item.type === 'item')
const km = KEYMAP.find((e) => e.id === 'reopenClosedTab')
assert.ok(km)
assert.match(km.keys, /Ctrl\+Shift\+T/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'reopenClosedTab'/)
assert.match(app, /pushClosedTab/)
assert.match(app, /popClosedTab/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reopen-closed-tab/)
console.log('test-reopen-closed-tab ok')
