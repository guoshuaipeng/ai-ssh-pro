/** Disconnect-all success toast lists hosts. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /sess\.disconnectedAllToast',\s*\{\s*n:\s*live\.length,\s*hosts\s*\}/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /sess\.disconnectedAllToast': '已断开 \{n\} 个会话（\{hosts\}）'/)
assert.match(i18n, /sess\.disconnectedAllToast': 'Disconnected \{n\} session\(s\) \(\{hosts\}\)'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-disconnect-all-toast-hosts/)
console.log('test-disconnect-all-toast-hosts ok')
