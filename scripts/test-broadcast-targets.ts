/** Broadcast target remember/prune + serial discoverability wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  broadcastStillActive,
  initialBroadcastSelection,
  pruneBroadcastTargets
} from '../src/shared/broadcast-targets'
import { translate } from '../src/renderer/src/lib/i18n'
import { SHARED_MENUS } from '../src/shared/menus'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')

assert.deepEqual(pruneBroadcastTargets(['a', 'b', 'c'], ['a', 'c']), ['a', 'c'])
assert.deepEqual(pruneBroadcastTargets(['a'], ['b']), [])
assert.deepEqual(pruneBroadcastTargets([], ['a']), [])

assert.equal(broadcastStillActive(true, ['a', 'b']), true)
assert.equal(broadcastStillActive(true, ['a']), false)
assert.equal(broadcastStillActive(false, ['a', 'b']), false)

assert.deepEqual(initialBroadcastSelection(['b', 'gone'], ['a', 'b', 'c']), ['b'])
assert.deepEqual(initialBroadcastSelection([], ['a', 'b']), ['a', 'b'])
assert.deepEqual(initialBroadcastSelection(['x'], []), [])

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /initialBroadcastSelection/)
assert.match(app, /pruneBroadcastTargets/)
assert.doesNotMatch(app, /setBroadcastTargets\(\[\]\)\s*\n\s*return false/)
assert.match(app, /action === 'serialPort'/)
assert.match(app, /serial\.unavailable/)

assert.ok(SHARED_MENUS.some((m) => m.items.some((i) => i.type === 'item' && i.id === 'serialPort')))
assert.match(translate('en', 'serial.unavailable'), /Serial ports/i)
assert.match(translate('zh-CN', 'serial.unavailable'), /串口/)
assert.match(readFileSync('README.md', 'utf8'), /## Serial ports/)
assert.match(readFileSync('README.zh-CN.md', 'utf8'), /## 串口/)

assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-broadcast-targets/)
console.log('test-broadcast-targets ok')
