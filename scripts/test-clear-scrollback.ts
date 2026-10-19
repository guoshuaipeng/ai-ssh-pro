/** View/CmdK clear terminal scrollback. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'clearScrollback')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /回滚|清空/)
assert.match(item.label.en.toLowerCase(), /scrollback/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'clearScrollback'/)
assert.match(app, /aiss-clear-scrollback/)

const pane = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
assert.match(pane, /aiss-clear-scrollback/)
assert.match(pane, /term\.clear\(\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'term.scrollbackCleared'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-clear-scrollback/)
console.log('test-clear-scrollback ok')
