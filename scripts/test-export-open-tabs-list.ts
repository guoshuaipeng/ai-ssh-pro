/** CmdK/File: copy open tabs list (name + host) to clipboard. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { formatOpenTabsList, tabExportHost, tabExportLabel } from '../src/shared/open-tabs-export'
import { SHARED_MENUS } from '../src/shared/menus'

const rows = [
  {
    title: 'web',
    status: 'connected',
    connectOpts: { host: '10.0.0.1', username: 'root', port: 22 }
  },
  {
    customTitle: 'db',
    status: 'disconnected',
    connectOpts: { host: 'db.local', username: 'ubuntu', port: 2222 }
  },
  { title: 'Settings', view: 'settings', status: 'connected' }
]
assert.equal(tabExportLabel(rows[0]!), 'web')
assert.equal(tabExportHost(rows[0]!), 'root@10.0.0.1')
assert.equal(tabExportHost(rows[1]!), 'ubuntu@db.local:2222')
const text = formatOpenTabsList(rows)
assert.match(text, /web — root@10\.0\.0\.1/)
assert.match(text, /db — ubuntu@db\.local:2222 \[disconnected\]/)
assert.match(text, /Settings/)

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'exportOpenTabsList')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /标签/)
assert.match(item.label.en.toLowerCase(), /tabs/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'exportOpenTabsList'/)
assert.match(app, /formatOpenTabsList/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-export-open-tabs-list/)
console.log('test-export-open-tabs-list ok')
