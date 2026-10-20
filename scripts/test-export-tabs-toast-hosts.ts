/** exportOpenTabsList toast lists tab titles. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'exportOpenTabsList'/)
assert.match(app, /tabs\.listCopied',\s*\{\s*n:\s*rows\.length,\s*hosts\s*\}/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /tabs\.listCopied': '已复制 \{n\} 个标签（\{hosts\}）'/)
assert.match(i18n, /tabs\.listCopied': 'Copied \{n\} tab\(s\) \(\{hosts\}\)'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-export-tabs-toast-hosts/)
console.log('test-export-tabs-toast-hosts ok')
