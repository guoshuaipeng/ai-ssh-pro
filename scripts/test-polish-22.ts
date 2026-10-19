/** Polish-22 / M-polish-7: modal chrome, sidebar selection, splitters, secondary/ghost. Package 0.6.45. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.54')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-22.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(styles, /\.modal-header\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border-muted\)/)
assert.match(styles, /\.modal-footer\s*\{[^}]*border-top:\s*1px solid var\(--color-border-muted\)/)
assert.match(styles, /\.modal-close\s*\{[^}]*width:\s*32px/)
assert.match(styles, /\.modal-close\s*\{[^}]*min-height:\s*32px/)
assert.ok(styles.includes('.modal-close:focus-visible'))
assert.match(styles, /\.profile-row:hover\s*\{[^}]*border-color:\s*transparent/)
assert.match(styles, /\.profile-row\.is-selected\s*\{[^}]*box-shadow:\s*inset 2px 0 0 var\(--color-accent\)/)
assert.match(styles, /\.layout-resizer\s*\{[^}]*background:\s*var\(--color-border-muted\)/)
assert.match(styles, /\.split-divider\s*\{[^}]*background:\s*var\(--color-border-muted\)/)
assert.ok(styles.includes('button.ghost'))
assert.match(styles, /button\.secondary:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--color-row-hover-bg\)/)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.54'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.45'), changelog.indexOf('## v0.6.44'))
assert.ok(note.includes('M-polish-7') || note.includes('对话框'))
assert.ok(changelogFor('0.6.45').length >= 1)

console.log('test-polish-22 ok')