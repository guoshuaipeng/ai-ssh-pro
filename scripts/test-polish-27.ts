/** Polish-27 / M-polish-12: stale-test sweep + the real drifts it exposed. Package 0.6.50. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import { DENSITY, l7Mode } from '../src/shared/density'
import { OPS_HOME_TWO_LINE_WIDTH } from '../src/shared/ops-home-density'
import { tabLabel } from '../src/shared/tab-label'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.58')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-27.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

// 1) Density model follows the ops-home container query (M17: rows go two-line under 760px).
assert.equal(DENSITY.opsTwoLine, OPS_HOME_TWO_LINE_WIDTH)
assert.equal(l7Mode(OPS_HOME_TWO_LINE_WIDTH - 1), 'two-line')
assert.equal(l7Mode(OPS_HOME_TWO_LINE_WIDTH), 'one-line')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.ok(features.includes(`@container (max-width: ${OPS_HOME_TWO_LINE_WIDTH - 1}px)`))

// 2) View tabs follow the UI language; host-qualified tool titles survive.
const en = (k: string) => ({ 'l7.title': 'Ops home', 'menu.resourceMonitor': 'Monitor' } as Record<string, string>)[k] ?? k
assert.equal(tabLabel({ title: '运维首页', view: 'home' }, en), 'Ops home')
assert.equal(tabLabel({ title: 'Monitor · web-01', view: 'monitor' }, en), 'Monitor · web-01')
assert.equal(tabLabel({ title: 'Mine', customTitle: 'Mine', view: 'home' }, en), 'Mine')

// 3) Empty-state icon well holds its glyph on tokens (no 48px glyph in a 40px well).
const icon = features.slice(features.indexOf('.empty-state-icon {'), features.indexOf('.empty-state-icon svg {'))
const glyph = features.slice(features.indexOf('.empty-state-icon svg {'), features.indexOf('.empty-state--compact .empty-state-icon {'))
assert.match(icon, /width:\s*var\(--space-7\)/)
assert.match(glyph, /width:\s*var\(--space-5\)/)
assert.doesNotMatch(icon + glyph, /\d+px/)

// 4) Version pins no longer freeze: legacy tests track the package version.
for (const f of ['test-round18.ts', 'test-round19.ts', 'test-polish-1.ts', 'test-core-a-context.ts']) {
  assert.ok(readFileSync('scripts/' + f, 'utf8').includes(`'${pkg.version}'`) || readFileSync('scripts/' + f, 'utf8').includes(`"${pkg.version}"`), `${f} tracks the package version`)
}

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.50'), changelog.indexOf('## v0.6.49'))
assert.ok(note.includes('M-polish-12'))
assert.ok(changelogFor('0.6.50').length >= 1)

console.log('test-polish-27 ok')