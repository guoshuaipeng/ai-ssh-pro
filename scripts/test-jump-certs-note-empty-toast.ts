/** setJumpHosts/checkCerts/editSessionNote toast when no profile. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const start = app.indexOf("action === 'setJumpHosts' || action === 'checkCerts' || action === 'editSessionNote'")
assert.ok(start >= 0)
const chunk = app.slice(start, start + 650)
assert.match(chunk, /if \(!profile\) \{\s*showToast\(tg\('l10\.none'\)\)/)
assert.match(chunk, /openConnectionEditor\(profile, focus\)/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.38')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-jump-certs-note-empty-toast/)
console.log('test-jump-certs-note-empty-toast ok')
