/** Disconnect confirm body includes host label. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /confirm\.disconnectSessionBody',\s*\{\s*host:\s*hostLabel\s*\}/)
assert.match(app, /statusHostChipLabel\(/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /confirm\.disconnectSessionBody': '将断开 \{host\}/)
assert.match(i18n, /confirm\.disconnectSessionBody': 'Disconnect SSH to \{host\}/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-disconnect-confirm-host/)
console.log('test-disconnect-confirm-host ok')
