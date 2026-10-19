/** Polish-21 / M-polish-6: status bar, CmdK focus, host-picker empty. Package 0.6.44. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.60')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-21.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(styles, /\.app-statusbar\s*\{[^}]*height:\s*28px/)
assert.ok(styles.includes('button.statusbar-slot:hover'))
assert.ok(styles.includes('button.statusbar-slot:focus-visible'))
assert.ok(styles.includes('.cmdp-input:focus-visible'))

const hp = readFileSync('src/renderer/src/components/HostPicker.tsx', 'utf8')
assert.ok(hp.includes('host-picker-empty'))
assert.ok(hp.includes('EmptyState compact'))
assert.doesNotMatch(hp, /cmdp-empty/)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.44'), changelog.indexOf('## v0.6.43'))
assert.ok(note.includes('M-polish-6') || note.includes('状态栏'))
assert.ok(changelogFor('0.6.44').length >= 1)

console.log('test-polish-21 ok')