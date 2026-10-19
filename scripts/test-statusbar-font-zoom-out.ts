/** Status bar font: Ctrl/Alt+click zooms out. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-font-size/)
assert.match(app, /e\.shiftKey/)
assert.match(app, /e\.altKey \|\| e\.ctrlKey \|\| e\.metaKey/)
assert.match(app, /bumpTerminalFontSize\(terminalPrefs\.fontSize, -1\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /Ctrl\/Alt/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.41')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-font-zoom-out/)
console.log('test-statusbar-font-zoom-out ok')
