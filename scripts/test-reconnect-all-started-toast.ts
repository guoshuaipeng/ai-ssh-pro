/** reconnectAllDropped shows started toast with hosts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'reconnectAllDropped'/)
assert.match(app, /palette\.reconnectAllStarted/)
assert.match(app, /n:\s*dropped\.length,\s*hosts/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /palette\.reconnectAllStarted': '正在重连 \{n\} 个会话（\{hosts\}）/)
assert.match(i18n, /palette\.reconnectAllStarted': 'Reconnecting \{n\} session\(s\) \(\{hosts\}\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-reconnect-all-started-toast/)
console.log('test-reconnect-all-started-toast ok')
