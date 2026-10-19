/** Disconnect-all confirm body lists host labels. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /confirm\.disconnectAllSessionsBody',\s*\{\s*n:\s*live\.length,\s*hosts\s*\}/)
assert.match(app, /hostLabels/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /disconnectAllSessionsBody': '将断开 \{n\} 个已连接会话（\{hosts\}）/)
assert.match(i18n, /disconnectAllSessionsBody': 'Will disconnect \{n\} live session\(s\) \(\{hosts\}\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-disconnect-all-confirm-hosts/)
console.log('test-disconnect-all-confirm-hosts ok')
