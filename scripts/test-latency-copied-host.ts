/** Latency chip copy toast includes host. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /data-testid="statusbar-latency"/)
assert.ok(app.includes("tg('sb.latencyCopied', { ms: clip, host })"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("sb.latencyCopied': '已复制 {host} 延迟 {ms}'"))
assert.ok(i18n.includes("sb.latencyCopied': 'Copied {host} latency {ms}'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-latency-copied-host/)
console.log('test-latency-copied-host ok')
