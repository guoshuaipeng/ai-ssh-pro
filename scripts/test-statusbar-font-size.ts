/** Status bar shows terminalPrefs.fontSize. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-font-size/)
assert.match(app, /sb\.fontSize/)
assert.match(app, /terminalPrefs\.fontSize/)
assert.match(app, /resetTerminalFontSize/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'sb\.fontSize'/)
assert.match(i18n, /'sb\.fontSizeTip'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-font-size/)

console.log('test-statusbar-font-size ok')
