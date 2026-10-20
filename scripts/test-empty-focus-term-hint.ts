/** Terminal empty state shows focus-terminal shortcut tip. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keysFor } from '../src/shared/keymap'

assert.equal(keysFor('focusTerminal'), 'Ctrl+Shift+`')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /term-empty-key-focus/)
assert.match(app, /keysFor\('focusTerminal'\)/)
assert.match(app, /ux08\.keyFocusTerm/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ux08.keyFocusTerm'"))
assert.ok((i18n.match(/'ux08\.keyFocusTerm'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.7.0')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-empty-focus-term-hint/)
console.log('test-empty-focus-term-hint ok')
