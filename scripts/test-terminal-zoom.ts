/** Terminal font zoom helpers + wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  TERMINAL_FONT_DEFAULT,
  TERMINAL_FONT_MAX,
  TERMINAL_FONT_MIN,
  bumpTerminalFontSize,
  clampTerminalFontSize,
  resetTerminalFontSize
} from '../src/shared/terminal-zoom'

assert.equal(clampTerminalFontSize(14), 14)
assert.equal(clampTerminalFontSize(9), TERMINAL_FONT_MIN)
assert.equal(clampTerminalFontSize(99), TERMINAL_FONT_MAX)
assert.equal(clampTerminalFontSize('bad'), TERMINAL_FONT_DEFAULT)
assert.equal(clampTerminalFontSize(14.6), 15)
assert.equal(bumpTerminalFontSize(14, 1), 15)
assert.equal(bumpTerminalFontSize(TERMINAL_FONT_MAX, 1), TERMINAL_FONT_MAX)
assert.equal(bumpTerminalFontSize(TERMINAL_FONT_MIN, -1), TERMINAL_FONT_MIN)
assert.equal(resetTerminalFontSize(), TERMINAL_FONT_DEFAULT)

const keymap = readFileSync('src/shared/keymap.ts', 'utf8')
assert.match(keymap, /id: 'zoomIn'/)
assert.match(keymap, /Ctrl\+=/)
assert.match(keymap, /id: 'zoomOut'/)
assert.match(keymap, /Ctrl\+-/)
assert.match(keymap, /id: 'zoomReset'/)
assert.match(keymap, /Ctrl\+0/)
assert.match(keymap, /zoomInAlt:\s*'zoomIn'/)

const menus = readFileSync('src/shared/menus.ts', 'utf8')
assert.match(menus, /'zoomIn'/)
assert.match(menus, /'zoomOut'/)
assert.match(menus, /'zoomReset'/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /bumpTerminalFontSize/)
assert.match(app, /resetTerminalFontSize/)
assert.match(app, /action === 'zoomIn'/)
assert.match(app, /zoom\.size/)

const store = readFileSync('src/main/app-store.ts', 'utf8')
assert.match(store, /clampTerminalFontSize/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'zoom\.size'/)
assert.match(i18n, /'zoom\.atMax'/)
assert.match(i18n, /'zoom\.atMin'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-terminal-zoom/)

console.log('test-terminal-zoom ok')
