/** Polish-19: Ops home calm layout — panel-width density, no maximize fork. Package 0.6.42. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import { OPS_HOME_CARD_CAP, OPS_HOME_TWO_LINE_WIDTH, opsHomeGridColumns, opsHomeRowLayout } from '../src/shared/ops-home-density'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.63')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-19.ts'), true)

assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

// M17 supersedes the polish-19 fold: one centred column, same structure maximized or windowed.
assert.equal(OPS_HOME_TWO_LINE_WIDTH, 760)
assert.equal(opsHomeRowLayout(OPS_HOME_TWO_LINE_WIDTH), 'one-line')
assert.equal(opsHomeRowLayout(OPS_HOME_TWO_LINE_WIDTH - 1), 'two-line')
assert.ok(opsHomeGridColumns(1920) >= opsHomeGridColumns(720))
assert.equal(OPS_HOME_CARD_CAP, 8)

const ops = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
assert.doesNotMatch(ops, /window\.innerHeight/)
assert.equal(ops.includes('l7-rail'), false)
assert.equal(ops.includes('data-ops-quiet'), false)
// Import / check-update stay reachable, now only in the header ⋯ menu.
const moreMenu = ops.slice(ops.indexOf('className="l7-more" role="menu"'), ops.indexOf('data-testid="l7b-settings"'))
assert.ok(moreMenu.includes('onImport') && moreMenu.includes('onCheckUpdate'))
assert.ok(ops.includes("t('l7.recentPlaybooks')"))

const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.equal(features.includes("data-ops-quiet"), false)
assert.ok(features.includes('@container (max-width: 759px)'))
assert.doesNotMatch(features, /@media \(max-width: 1024px\)\s*\{\s*\.l7b-long/)
assert.doesNotMatch(features, /\.l7-body/)

const density = readFileSync('src/shared/ops-home-density.ts', 'utf8')
assert.ok(density.includes('OPS_HOME_TWO_LINE_WIDTH'))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.42'), changelog.indexOf('## v0.6.41'))
assert.ok(note.includes('运维首页') || note.includes('Ops home'))
assert.ok(changelogFor('0.6.42').length >= 1)
assert.ok(changelogFor('0.6.41').length >= 1)

console.log('test-polish-19 ok')