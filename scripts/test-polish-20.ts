/** Polish-20 / M-polish-5: empty calm card, toast, focus-visible, tab accent. Package 0.6.43. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.52')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-20.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(features, /\.empty-state\s*\{[^}]*border:\s*1px solid var\(--color-border-default\)/)
assert.match(features, /\.empty-state\s*\{[^}]*background:\s*var\(--color-bg-elevated\)/)
assert.match(features, /\.empty-state-icon\s*\{[^}]*background:\s*var\(--color-accent-muted\)/)
assert.match(features, /\.empty-state-icon\s*\{[^}]*color:\s*var\(--color-accent\)/)
assert.match(features, /\.empty-state-desc\s*\{[^}]*color:\s*var\(--color-text-secondary\)/)
assert.ok(features.includes('alert-rules-panel:focus-visible'))

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(styles, /\.toast\s*\{[^}]*border-radius:\s*10px/)
assert.ok(styles.includes(".toast[data-toast-theme='success']"))
assert.ok(styles.includes('docker-log-filter:focus-visible'))
assert.match(styles, /\.tab\.active \.tab-kind-icon\s*\{[^}]*color:\s*var\(--color-accent\)/)
assert.match(styles, /\.ai-reply-empty\s*\{[^}]*border:\s*1px solid var\(--color-border-default\)/)

assert.equal(existsSync('src/renderer/src/assets/ai-sparkle.png'), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.52'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.43'), changelog.indexOf('## v0.6.42'))
assert.ok(note.includes('M-polish-5') || note.includes('空态'))
assert.ok(changelogFor('0.6.43').length >= 1)

console.log('test-polish-20 ok')