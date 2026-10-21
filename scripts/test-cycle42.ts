import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dupOrdinals, withOrdinal } from '../src/shared/tab-dedupe'
// D101
const m = dupOrdinals([{ id: 'a', label: 'demo' }, { id: 'b', label: 'web' }, { id: 'c', label: 'demo' }, { id: 'd', label: 'demo' }])
assert.equal(m.get('a'), undefined); assert.equal(m.get('b'), undefined)
assert.equal(m.get('c'), 2); assert.equal(m.get('d'), 3)
assert.equal(withOrdinal('demo', 2), 'demo · 2'); assert.equal(withOrdinal('demo', undefined), 'demo')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /data-testid="tab-dup-n"/)
assert.match(app, /primaryTitle=\{dupLabelFor\(t\)\}/)
assert.match(app, /title: dupLabelBySession\(x\.sessionId\) \|\| x\.title/)
// D102: only the empty strip, tab double-click still renames
assert.match(app, /if \(e\.target !== e\.currentTarget\) return\s*handleTitlebarMenuActionRef\.current\('connection'\)/)
assert.match(app, /onDoubleClick=\{\(\) => startRename\(t\.tabId\)\}/)
// D103
assert.match(app, /title=\{\[sessionTip, sftpAddr, guardTip,/)
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['d102.tip', 'd103.tip', 'd103.connected', 'd103.connecting', 'd103.disconnected']) assert.equal(i18n.split(`'${k}'`).length - 1, 2, k)
console.log('test-cycle42 ok')
