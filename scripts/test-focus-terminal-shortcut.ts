/** Ctrl+Shift+` focuses terminal via keymap. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KEYMAP, keysFor, matchKeymap } from '../src/shared/keymap'

const entry = KEYMAP.find((k) => k.id === 'focusTerminal')
assert.ok(entry)
assert.equal(entry.keys, 'Ctrl+Shift+`')
assert.equal(keysFor('focusTerminal'), 'Ctrl+Shift+`')

const hit = matchKeymap(
  { key: '~', code: 'Backquote', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false },
  true
)
assert.equal(hit, 'focusTerminal')

const hit2 = matchKeymap(
  { key: '`', code: 'Backquote', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false },
  false
)
assert.equal(hit2, 'focusTerminal')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'focusTerminal'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.60')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-focus-terminal-shortcut/)
console.log('test-focus-terminal-shortcut ok')
