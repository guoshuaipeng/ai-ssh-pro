/** Single-session disconnect toast includes host. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'disconnectSession'/)
assert.match(app, /sess\.disconnectedToast',\s*\{\s*host:/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /sess\.disconnectedToast': '已断开 \{host\}'/)
assert.match(i18n, /sess\.disconnectedToast': 'Disconnected \{host\}'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.41')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-disconnect-toast-host/)
console.log('test-disconnect-toast-host ok')
