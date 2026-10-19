/** Polish-26 / M-polish-11: visible chrome padding/gap/font-size on tokens. Package 0.6.49. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.57')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-26.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const styles = readFileSync('src/renderer/src/styles.css', 'utf8').replace(/\r\n/g, '\n')
const rule = (sel: string) => {
  const re = new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g')
  return [...styles.matchAll(re)].map((m) => m[2]).join('\n')
}
assert.match(rule('.app-titlebar'), /gap:\s*var\(--space-2\)/)
assert.match(rule('.app-titlebar'), /padding:\s*0 var\(--space-2\)/)
assert.match(rule('.titlebar-menu-dropdown'), /padding:\s*var\(--space-1\)/)
assert.match(rule('.session-context-menu'), /padding:\s*var\(--space-1\)/)
assert.match(rule('.session-context-menu-item'), /font-size:\s*var\(--fs-base\)/)
assert.match(rule('.cmdp-input'), /font-size:\s*var\(--fs-lg\)/)
assert.match(rule('.cmdp-list'), /padding:\s*var\(--space-1\)/)
assert.match(rule('.toast-stack'), /gap:\s*var\(--space-2\)/)
assert.match(rule('.toast'), /gap:\s*var\(--space-3\)/)
assert.match(rule('.modal-backdrop'), /padding:\s*var\(--space-4\)/)

// Token-equal px left in these chrome rules' padding/gap/font-size: none.
for (const sel of ['.app-titlebar', '.titlebar-menu-dropdown', '.session-context-menu', '.cmdp-list', '.toast-stack', '.toast', '.modal-backdrop', '.sidebar-info-banner']) {
  const body = rule(sel)
  assert.doesNotMatch(body, /(padding|gap|font-size)[\w-]*:\s*[^;]*\b(4|8|12|16|24|32)px/, `${sel} spacing on tokens`)
}

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.49'), changelog.indexOf('## v0.6.48'))
assert.ok(note.includes('M-polish-11'))
const prevNote = changelog.slice(changelog.indexOf('## v0.6.48'), changelog.indexOf('## v0.6.47'))
assert.ok(prevNote.includes('M-polish-10'))
assert.ok(changelogFor('0.6.49').length >= 1)

console.log('test-polish-26 ok')