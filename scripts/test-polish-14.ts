/** Polish-14 / M-polish-1: fonts + chrome tokens. Package tracks current soft-start. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import { TERMINAL_PREFS_DEFAULTS } from '../src/shared/ipc'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  dependencies?: Record<string, string>
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.59')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.ok(pkg.dependencies?.['@fontsource/inter'])
assert.ok(pkg.dependencies?.['@fontsource/jetbrains-mono'])
assert.ok(pkg.dependencies?.['@fontsource/noto-sans-sc'])
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-14.ts'), true)

assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const main = readFileSync('src/renderer/src/main.tsx', 'utf8')
assert.ok(main.includes("@fontsource/inter/400.css"))
assert.ok(main.includes("@fontsource/jetbrains-mono/400.css"))
assert.ok(main.includes("@fontsource/noto-sans-sc/chinese-simplified-400.css"))

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(css.includes("--font-ui:"))
assert.ok(css.includes("--font-sans:"))
assert.ok(css.includes("--font-mono:"))
assert.ok(css.includes("'Inter'"))
assert.ok(css.includes("'Noto Sans SC'"))
assert.ok(css.includes("'JetBrains Mono'"))
assert.ok(css.includes('--mut:'))
assert.ok(css.includes('--line:'))
assert.ok(css.includes('--ac:'))
assert.ok(css.includes('font-family: var(--font-ui)'))
assert.match(css, /\.sidebar-header\s*\{[^}]*padding:\s*var\(--space-3\)/)
assert.match(css, /\.app-toolbar\s*\{[^}]*gap:\s*var\(--space-\d\)\s+var\(--space-\d\)/)
// M15 (0.6.53): dialogs moved to the overlay radius scale (14px, DataAI parity).
assert.match(css, /\.modal-panel\s*\{[^}]*border-radius:\s*var\(--radius-dialog\)/)

const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(features, /\.empty-state\s*\{[^}]*gap:\s*var\(--space-3\)/)
assert.match(features, /\.empty-state-title\s*\{[^}]*letter-spacing:\s*0\.01em/)

assert.ok(TERMINAL_PREFS_DEFAULTS.fontFamily.includes('JetBrains Mono'))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.37'), changelog.indexOf('## v0.6.36'))
assert.ok(note.includes('M-polish-1') || note.includes('质感专项'))
assert.ok(note.includes('Inter'))
assert.ok(note.includes('JetBrains Mono'))
assert.ok(note.includes('0.6.37'))
assert.ok(changelogFor('0.6.37').length >= 2)
assert.ok(changelogFor('0.6.36').length >= 2)

console.log('test-polish-14 ok')
