/** View/CmdK focus active terminal (aiss-focus-terminal). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'focusTerminal')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /终端/)
assert.match(item.label.en.toLowerCase(), /terminal/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'focusTerminal'/)
assert.match(app, /aiss-focus-terminal/)

const pane = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
assert.match(pane, /aiss-focus-terminal/)
assert.match(pane, /term\.focus\(\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.50')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-focus-terminal-cmdk/)
console.log('test-focus-terminal-cmdk ok')
