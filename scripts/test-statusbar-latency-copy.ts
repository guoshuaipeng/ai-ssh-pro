/** Status-bar latency chip copies RTT on click. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { latencyClipboardText } from '../src/shared/status-bar'

assert.equal(latencyClipboardText(undefined), null)
assert.equal(latencyClipboardText(null), null)
assert.equal(latencyClipboardText(42.6), '43 ms')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-latency/)
assert.match(app, /latencyClipboardText/)
assert.match(app, /sb\.latencyCopied/)
assert.match(app, /<button[\s\S]*?statusbar-latency/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.latencyCopied'"))
assert.ok(i18n.includes("'sb.latencyTipCopy'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.56')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-latency-copy/)
console.log('test-statusbar-latency-copy ok')
