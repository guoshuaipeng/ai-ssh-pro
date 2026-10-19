/** Polish-18: pin layout toggles (AI sparkle) outside titlebar corner. Package 0.6.41. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.46')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-18.ts'), true)

assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.ok(toolbar.includes('app-titlebar-layout-pin'))
assert.ok(toolbar.includes('data-testid="titlebar-layout-pin"'))
assert.ok(toolbar.includes('layout-toggle-ai'))
assert.ok(toolbar.includes("data-testid={`layout-toggle-${item.kind}`}"))
// Pin is a sibling of corner, not nested inside it
const cornerOpen = toolbar.indexOf('className="app-titlebar-corner"')
const cornerClose = toolbar.indexOf('app-titlebar-layout-pin')
assert.ok(cornerOpen > 0 && cornerClose > cornerOpen)
const between = toolbar.slice(cornerOpen, cornerClose)
assert.ok(between.includes('</div>'), 'corner closes before layout pin')
assert.equal(between.includes('layout-toggle'), false, 'layout toggles must not live inside corner')

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(styles, /\.app-titlebar-layout-pin[\s\S]*?flex-shrink:\s*0/)
assert.match(styles, /\.app-titlebar-layout-pin,\s*\n?\s*\.app-toolbar-layout\s*\{[\s\S]*?flex:\s*0\s+0\s+auto/)
assert.match(styles, /\.app-toolbar-layout[\s\S]*?min-width:\s*max-content/)
assert.match(styles, /\.titlebar-search-btn\s*\{[\s\S]*?flex:\s*0\s+1\s+140px/)
assert.match(styles, /\.titlebar-search-btn\s*\{[\s\S]*?min-width:\s*36px/)

const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(features, /\.titlebar-compact-3\s+\.titlebar-search-btn/)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.46'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.41'), changelog.indexOf('## v0.6.40'))
assert.ok(note.includes('layout') || note.includes('星芒') || note.includes('sparkle') || note.includes('窄窗'))
assert.ok(changelogFor('0.6.41').length >= 1)
assert.ok(changelogFor('0.6.40').length >= 2)

console.log('test-polish-18 ok')
