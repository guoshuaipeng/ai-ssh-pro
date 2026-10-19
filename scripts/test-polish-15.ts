/** Polish-15 / M-polish-2: icon stroke, toolbar density, light motion. Package tracks current soft-start. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import { CHROME_ICON_SIZE, CHROME_ICON_STROKE, EMPTY_ICON_STROKE } from '../src/renderer/src/components/emptyIcons'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.50')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-15.ts'), true)

assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(CHROME_ICON_SIZE, 16)
assert.equal(CHROME_ICON_STROKE, EMPTY_ICON_STROKE)
assert.equal(CHROME_ICON_STROKE, 1.5)

const iconSrc = readFileSync('src/renderer/src/components/Icon.tsx', 'utf8')
assert.match(iconSrc, /strokeWidth = 1\.5/)
assert.doesNotMatch(iconSrc, /strokeWidth = 1\.75/)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.ok(toolbar.includes('CHROME_ICON_SIZE'))
assert.ok(toolbar.includes('CHROME_ICON_STROKE'))
assert.doesNotMatch(toolbar, /size=\{20\}/)

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(css.includes('--icon-size-chrome: 16px'))
assert.match(css, /--icon-size-tab:\s*\d+px/)
assert.match(css, /\.titlebar-icon-btn svg[\s\S]*?width:\s*var\(--icon-size-chrome\)/)
assert.match(css, /\.toolbar-group\s*\{[^}]*gap:\s*var\(--space-1\)/)
assert.match(css, /\.app-toolbar\s*\{[^}]*gap:\s*var\(--space-1\)\s+var\(--space-3\)/)
assert.match(css, /\.titlebar-icon-btn\s*\{[^}]*transition:\s*background\s+var\(--duration-fast\)/)
assert.match(css, /\.tab\s*\{[^}]*transition:\s*background\s+var\(--duration-fast\)/)
assert.match(css, /\.tab:hover:not\(\.active\)\s*\{[^}]*--color-row-hover-bg/)
assert.match(css, /\.cmdp-item\s*\{[^}]*transition:\s*background\s+var\(--duration-fast\)/)
assert.match(css, /\.cmdp-item\s*\{[^}]*min-height:\s*32px/)
assert.match(css, /:focus-visible\s*\{[^}]*--color-focus-ring/)
assert.match(css, /button\.layout-toggle-btn\s*\{[^}]*min-height:\s*32px/)
assert.match(css, /button\.layout-toggle-btn\s*\{[^}]*transition:/)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.50'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.38'), changelog.indexOf('## v0.6.37'))
assert.ok(note.includes('M-polish-2') || note.includes('质感专项'))
assert.ok(note.includes('1.5') || note.includes('描边'))
assert.ok(changelogFor('0.6.38').length >= 2)
assert.ok(changelogFor('0.6.37').length >= 2)

console.log('test-polish-15 ok')
