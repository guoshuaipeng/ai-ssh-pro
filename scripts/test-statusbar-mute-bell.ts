/** Status-bar chip when muteBell; click restores bell. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-mute-bell/)
assert.match(app, /terminalPrefs\.muteBell/)
assert.match(app, /muteBell:\s*false/)
assert.match(app, /term\.bellUnmuted/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.muteBell'"))
assert.ok(i18n.includes("'sb.muteBellTip'"))
assert.ok((i18n.match(/'sb\.muteBell'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.43')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-mute-bell/)
console.log('test-statusbar-mute-bell ok')
