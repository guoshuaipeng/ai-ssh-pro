/** find action toasts when no active terminal session. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const idx = app.indexOf("action === 'find'")
assert.ok(idx >= 0)
const block = app.slice(idx, idx + 320)
assert.match(block, /activeSessionIdRef\.current/)
assert.match(block, /term\.noSession/)
assert.match(block, /requestTerminalFind/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes('term.noSession'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-find-no-session-toast/)
console.log('test-find-no-session-toast ok')
