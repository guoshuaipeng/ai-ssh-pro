/** Status-bar pin chip unpin toast includes host. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /data-testid="statusbar-pin"/)
assert.match(app, /tab\.unpinnedHost/)
const pinAt = app.indexOf('statusbar-pin')
assert.ok(pinAt >= 0)
assert.match(app.slice(pinAt, pinAt + 900), /tab\.unpinnedHost/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /tab\.unpinnedHost': '已取消固定 \{host\}'/)
assert.match(i18n, /tab\.unpinnedHost': 'Unpinned \{host\}'/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-unpin-host/)
console.log('test-statusbar-unpin-host ok')
