/** Ctrl+Shift+K clears terminal scrollback via keymap. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KEYMAP, keysFor, matchKeymap } from '../src/shared/keymap'
import { SHARED_MENUS } from '../src/shared/menus'

const entry = KEYMAP.find((k) => k.id === 'clearScrollback')
assert.ok(entry)
assert.equal(entry.keys, 'Ctrl+Shift+K')
assert.equal(keysFor('clearScrollback'), 'Ctrl+Shift+K')

const hit = matchKeymap(
  { key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false },
  true
)
assert.equal(hit, 'clearScrollback')

assert.ok(SHARED_MENUS.flatMap((m) => m.items).some((it) => it.type === 'item' && it.id === 'clearScrollback'))

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'clearScrollback'/)
assert.match(app, /aiss-clear-scrollback/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.39')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-clear-scrollback-shortcut/)
console.log('test-clear-scrollback-shortcut ok')
