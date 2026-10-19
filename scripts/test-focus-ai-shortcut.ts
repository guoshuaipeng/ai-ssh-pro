/** Ctrl+Shift+A focuses AI panel via keymap. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { KEYMAP, keysFor, matchKeymap } from '../src/shared/keymap'

const entry = KEYMAP.find((k) => k.id === 'focusAiPanel')
assert.ok(entry)
assert.equal(entry.keys, 'Ctrl+Shift+A')
assert.equal(keysFor('focusAiPanel'), 'Ctrl+Shift+A')

const hit = matchKeymap(
  { key: 'a', code: 'KeyA', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false },
  true
)
assert.equal(hit, 'focusAiPanel')

// toggleAi still bound
assert.equal(keysFor('toggleAi'), 'Ctrl+Alt+B')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'focusAiPanel'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-focus-ai-shortcut/)
console.log('test-focus-ai-shortcut ok')
