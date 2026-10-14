import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KEYMAP, matchKeymap, keysFor, isShellReservedKey } from '../src/shared/keymap'
import { SHARED_MENUS } from '../src/shared/menus'
import { SHORTCUTS } from '../src/shared/workspace-features'
import { changelogFor, CHANGELOG } from '../src/shared/changelog'
import { hostStatusLevel } from '../src/shared/host-status'
import { findInBuffer } from '../src/renderer/src/lib/terminal-find'
import { shouldAutoCheck, isSkipped, skipVersion, summarizeNotes } from '../src/renderer/src/lib/update-check'
import { probeTcp } from '../src/main/host-probe'
import { createServer } from 'node:net'

const ev = (keys: string) => {
  const parts = keys.split('+')
  const k = parts[parts.length - 1]!
  const code = /^[A-Z]$/.test(k) ? `Key${k}` : /^[0-9]$/.test(k) ? `Digit${k}` : k === ',' ? 'Comma' : k
  return { key: k, code, ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift'), altKey: parts.includes('Alt'), metaKey: false }
}

// UX-02: one registry, no duplicate bindings, expected final keys
const keys = KEYMAP.map((k) => k.keys)
assert.equal(new Set(keys).size, keys.length, 'no duplicate key bindings')
assert.equal(new Set(KEYMAP.map((k) => k.id)).size, KEYMAP.length, 'unique ids')
const want: Record<string, string> = {
  connection: 'Ctrl+Shift+N', sftp: 'Ctrl+Alt+F', serverTools: 'Ctrl+Alt+T', find: 'Ctrl+Shift+F', settings: 'Ctrl+,',
  resourceMonitor: 'Ctrl+Shift+M', portForward: 'Ctrl+Shift+O', batchExec: 'Ctrl+Shift+B', snippets: 'Ctrl+Shift+S',
  inventory: 'Ctrl+Shift+H', toggleAi: 'Ctrl+Alt+B', toggleSidebar: 'Ctrl+Alt+1', shortcuts: 'F1'
}
for (const [id, k] of Object.entries(want)) assert.equal(keysFor(id), k, `${id} → ${k}`)
assert.ok(!keys.includes('Ctrl+Shift+D'), 'Refresh Docker no longer takes a shortcut')
assert.ok(!keys.includes('Ctrl+B'), 'Ctrl+B is free for the shell')
assert.deepEqual(SHORTCUTS.map((s) => s.keys), keys, 'F1 panel data equals the registry')

// UX-01: plain Ctrl+letter goes to the shell when a terminal has focus
assert.equal(matchKeymap(ev('Ctrl+B'), true), undefined)
assert.equal(matchKeymap(ev('Ctrl+K'), true), undefined, 'Ctrl+K stays with the shell in a terminal')
assert.equal(matchKeymap(ev('Ctrl+K'), false), 'commandPalette')
assert.equal(matchKeymap(ev('Ctrl+Shift+P'), true), 'commandPalette')
assert.equal(matchKeymap(ev('Ctrl+Alt+1'), true), 'toggleSidebar')
assert.equal(matchKeymap(ev('Ctrl+Alt+F'), true), 'sftp')
assert.equal(matchKeymap(ev('Ctrl+Shift+F'), true), 'find')
assert.equal(matchKeymap(ev('Ctrl+,'), true), 'settings')
assert.equal(matchKeymap(ev('F1'), false), 'shortcuts')
for (const k of KEYMAP) {
  if (k.scope === 'global') assert.ok(!isShellReservedKey(ev(k.keys)), `${k.keys} does not steal a plain Ctrl+letter`)
}

// UX-03: 7 menus in conventional order; palette appears once; toggles flagged
assert.deepEqual(SHARED_MENUS.map((m) => m.id), ['file', 'edit', 'view', 'session', 'ops', 'ai', 'help'])
const all = SHARED_MENUS.flatMap((m) => m.items).filter((i) => i.type === 'item')
assert.equal(all.filter((i) => i.type === 'item' && i.id === 'commandPalette').length, 1, 'palette listed once')
for (const id of ['toggleSidebar', 'toggleAi', 'toggleSplit', 'toggleBroadcast', 'toggleRecording', 'toggleHostStatus']) {
  assert.ok(all.some((i) => i.type === 'item' && i.id === id && i.toggle), `${id} is a toggle`)
}
for (const i of all) if (i.type === 'item') assert.ok(i.label.zh && i.label.en, `${i.id} has zh+en`)
const menuSrc = readFileSync('src/main/application-menu.ts', 'utf8')
assert.ok(menuSrc.includes('SHARED_MENUS') && !/label: '会话'/.test(menuSrc), 'main menu reads the shared definition')
assert.ok(!/CmdOrCtrl\+B'/.test(menuSrc), 'main process no longer binds Ctrl+B')

// V3 + R1: changelog for the current version, also in CHANGELOG.md
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
assert.ok(changelogFor(pkg.version).length >= 4, 'in-app changelog for current version')
assert.ok(changelogFor(`v${pkg.version}-dev`).length > 0)
assert.ok(readFileSync('CHANGELOG.md', 'utf8').includes(`## v${pkg.version}`), 'CHANGELOG.md has this version')
assert.ok(Object.values(CHANGELOG).flat().every((e) => e.text.zh && e.text.en))
const wf = readFileSync('.github/workflows/release.yml', 'utf8')
assert.ok(wf.includes('CHANGELOG.md') && wf.includes('--draft=false'), 'release job publishes notes from CHANGELOG.md')

// V2 helpers
const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
assert.equal(shouldAutoCheck(Date.now(), store), true)
mem.set('aiss.updateCheckedAt', String(Date.now()))
assert.equal(shouldAutoCheck(Date.now(), store), false)
assert.equal(shouldAutoCheck(Date.now() + 25 * 3600 * 1000, store), true)
skipVersion('0.3.13', store)
assert.equal(isSkipped('0.3.13', store), true)
assert.equal(isSkipped('0.3.14', store), false)
assert.deepEqual(summarizeNotes('# T\n- **A** one\n* two\ntext\n- 3\n- 4\n- 5\n- 6'), ['A one', 'two', '3', '4', '5'])

// terminal find
const lines = ['hello world', 'foo bar', 'Hello again']
assert.deepEqual(findInBuffer(lines, 'hello', null), { row: 0, col: 0 })
assert.deepEqual(findInBuffer(lines, 'hello', { row: 0, col: 0 }), { row: 2, col: 0 })
assert.deepEqual(findInBuffer(lines, 'hello', { row: 2, col: 0 }), { row: 0, col: 0 }, 'wraps')
assert.deepEqual(findInBuffer(lines, 'hello', { row: 0, col: 0 }, true), { row: 2, col: 0 }, 'backwards wraps')
assert.equal(findInBuffer(lines, 'zzz', null), null)

// H2
assert.equal(hostStatusLevel(undefined), 'checking')
assert.equal(hostStatusLevel({ id: 'a', latencyMs: null, checkedAt: 0 }), 'offline')
assert.equal(hostStatusLevel({ id: 'a', latencyMs: 20, checkedAt: 0 }), 'online')
assert.equal(hostStatusLevel({ id: 'a', latencyMs: 450, checkedAt: 0 }), 'slow')

// i18n: every new key in both languages
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['upd.title', 'upd.badge', 'ver.tooltip', 'wn.noAuto', 'toolbar.needSession', 'ctx.copyAddr', 'ctx.connectNewTab', 'hs.online', 'find.placeholder']) {
  assert.equal((i18n.match(new RegExp(`'${k.replace('.', '\\.')}':`, 'g')) ?? []).length, 2, `${k} zh+en`)
}

// H2 TCP probe against a local server
const srv = createServer().listen(0, '127.0.0.1')
await new Promise((r) => srv.once('listening', r))
const port = (srv.address() as { port: number }).port
const ms = await probeTcp('127.0.0.1', port, 2000)
assert.ok(ms != null && ms >= 0, 'reachable port has latency')
srv.close()
assert.equal(await probeTcp('127.0.0.1', 1, 1500), null, 'closed port is offline')
console.log('round12 ok')
