/** reconnectNow shows host in started toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'reconnectNow'/)
assert.match(app, /sess\.reconnectStarted/)
assert.match(app, /host:\s*hostLabel/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /sess\.reconnectStarted': '正在重连 \{host\}/)
assert.match(i18n, /sess\.reconnectStarted': 'Reconnecting \{host\}/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reconnect-started-toast/)
console.log('test-reconnect-started-toast ok')
