/** Disconnected terminal card shows reason + copy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /term-disconnect-reason/)
assert.match(app, /term-copy-disconnect-reason/)
assert.match(app, /friendlyErrorMessage\(t\.failRaw/)
assert.match(app, /term\.disconnectReasonCopied/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'term.copyDisconnectReason'"))
assert.ok(i18n.includes("'term.disconnectReasonCopied'"))
assert.ok((i18n.match(/'term\.copyDisconnectReason'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.59')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-disconnect-reason-copy/)
console.log('test-disconnect-reason-copy ok')
