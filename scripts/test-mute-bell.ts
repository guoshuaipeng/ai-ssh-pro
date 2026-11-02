/** Mute terminal bell prefs + View toggle. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TERMINAL_PREFS_DEFAULTS } from '../src/shared/ipc'
import { SHARED_MENUS, allMenuActionIds, type SharedMenuItem } from '../src/shared/menus'

assert.equal(TERMINAL_PREFS_DEFAULTS.muteBell, false)

function findItem(items: SharedMenuItem[], id: string): SharedMenuItem | undefined {
  for (const it of items) {
    if (it.type === 'item' && it.id === id) return it
    if (it.type === 'sub') {
      const hit = findItem(it.items, id)
      if (hit) return hit
    }
  }
  return undefined
}

assert.ok(allMenuActionIds(SHARED_MENUS.find((m) => m.id === 'view')!).includes('toggleMuteBell'))
const item = SHARED_MENUS.flatMap((m) => {
  const walk = (items: SharedMenuItem[]): SharedMenuItem[] =>
    items.flatMap((it) => (it.type === 'sub' ? walk(it.items) : [it]))
  return walk(m.items)
}).find((it) => it.type === 'item' && it.id === 'toggleMuteBell')
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

const prefs = readFileSync('src/shared/terminal-prefs.ts', 'utf8')
assert.match(prefs, /muteBell/)
const storeRs = readFileSync('src-tauri/src/store.rs', 'utf8')
assert.match(storeRs, /muteBell/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.7.0')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-mute-bell/)
console.log('test-mute-bell ok')
