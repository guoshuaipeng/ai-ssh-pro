/** Polish-23 / M-polish-8: workspace toolbar, sidebar head, form focus. Package 0.6.46. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.52')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-23.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(styles, /\.workspace-panel-toolbar\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border-muted\)/)
assert.match(styles, /\.workspace-panel-toolbar\s*\{[^}]*padding:\s*var\(--space-2\)\s+var\(--space-3\)/)
assert.match(styles, /\.workspace-panel-title\s*\{[^}]*font-size:\s*var\(--fs-sm\)/)
assert.match(styles, /\.sidebar-header\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border-muted\)/)
assert.match(styles, /\.sidebar-header h3\s*\{[^}]*font-size:\s*var\(--fs-sm\)/)
assert.match(styles, /\.split-toolbar\s*\{[^}]*border-bottom:\s*1px solid var\(--color-border-muted\)/)
assert.ok(styles.includes('input:focus-visible'))
assert.ok(styles.includes('textarea:focus-visible'))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.52'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.46'), changelog.indexOf('## v0.6.45'))
assert.ok(note.includes('M-polish-8') || note.includes('工作区'))
assert.ok(changelogFor('0.6.46').length >= 1)

console.log('test-polish-23 ok')