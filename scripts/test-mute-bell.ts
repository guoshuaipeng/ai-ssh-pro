/** Mute terminal bell prefs + View toggle. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TERMINAL_PREFS_DEFAULTS } from '../src/shared/ipc'
import { SHARED_MENUS } from '../src/shared/menus'

assert.equal(TERMINAL_PREFS_DEFAULTS.muteBell, false)

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'toggleMuteBell')
assert.ok(item && item.type === 'item' && item.toggle)

const pane = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
assert.match(pane, /term\.onBell/)
assert.match(pane, /muteBellRef/)
assert.match(pane, /terminal-bell-flash/)
assert.doesNotMatch(pane, /bellStyle/)

const modal = readFileSync('src/renderer/src/components/TerminalPrefsModal.tsx', 'utf8')
assert.match(modal, /data-testid="mute-bell"/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'toggleMuteBell'/)
assert.match(app, /muteBell:\s*next/)

const store = readFileSync('src/main/app-store.ts', 'utf8')
assert.match(store, /muteBell/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-mute-bell/)
console.log('test-mute-bell ok')
