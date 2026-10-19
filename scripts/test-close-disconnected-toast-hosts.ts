/** Close disconnected tabs toast lists hosts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'closeDisconnectedTabs'/)
assert.match(app, /tab\.list\.closedToast',\s*\{\s*n:\s*snapshots\.length,\s*hosts\s*\}/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /tab\.list\.closedToast': '已关闭 \{n\} 个断开的会话（\{hosts\}）'/)
assert.match(i18n, /tab\.list\.closedToast': 'Closed \{n\} disconnected session\(s\) \(\{hosts\}\)'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-close-disconnected-toast-hosts/)
console.log('test-close-disconnected-toast-hosts ok')
