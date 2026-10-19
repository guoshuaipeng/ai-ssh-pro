/** Polish-19: Ops home calm layout — panel-width density, no maximize fork. Package 0.6.42. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import {
  OPS_HOME_FOLD_RAIL_WIDTH,
  OPS_HOME_QUIET_CARD_CAP,
  OPS_HOME_WIDE_CARD_CAP,
  opsHomeCardCap,
  opsHomeQuietLayout
} from '../src/shared/ops-home-density'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.50')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-19.ts'), true)

assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

assert.equal(OPS_HOME_FOLD_RAIL_WIDTH, 1100)
assert.equal(opsHomeCardCap(1366), OPS_HOME_QUIET_CARD_CAP)
assert.equal(opsHomeCardCap(1920), OPS_HOME_WIDE_CARD_CAP)
assert.equal(opsHomeQuietLayout(1100).foldSecondary, true)
assert.equal(opsHomeQuietLayout(1101, 500).foldSecondary, false)
assert.equal(opsHomeQuietLayout(1920, 600).foldSecondary, false)

const ops = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
assert.ok(ops.includes('rootRef'))
assert.ok(ops.includes('ResizeObserver'))
assert.ok(ops.includes('opsHomeQuietLayout(opsWidth)'))
assert.doesNotMatch(ops, /window\.innerHeight/)
assert.ok(ops.includes('data-ops-quiet'))
assert.ok(ops.includes('l7-rail-collapsed'))
// Import / check-update not always-visible on rail (still in ⋯ collapsed)
const railStart = ops.indexOf('className="l7-col l7-rail"')
const railSplit = ops.indexOf('l7-rail-split', railStart)
const railEnd = railSplit > railStart ? railSplit : ops.indexOf('</aside>', railStart)
assert.ok(railStart > 0 && railEnd > railStart)
const railBody = ops.slice(railStart, railEnd)
assert.equal(railBody.includes('onImport'), false)
assert.equal(railBody.includes('onCheckUpdate'), false)
assert.ok(ops.includes("t('l7.recentPlaybooks')"))

const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.ok(features.includes(".l7-root[data-ops-quiet='1'] .l7-rail"))
assert.ok(features.includes('@container (max-width: 1100px)'))
assert.ok(features.includes('@container (max-width: 720px)'))
assert.doesNotMatch(features, /@media \(max-width: 1024px\)\s*\{\s*\.l7b-long/)
assert.doesNotMatch(features, /@container \(max-width: 1199px\)\s*\{\s*\.l7-body/)

const density = readFileSync('src/shared/ops-home-density.ts', 'utf8')
assert.ok(density.includes('OPS_HOME_FOLD_RAIL_WIDTH'))
assert.ok(density.includes('_height'))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.50'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.42'), changelog.indexOf('## v0.6.41'))
assert.ok(note.includes('运维首页') || note.includes('Ops home'))
assert.ok(changelogFor('0.6.42').length >= 1)
assert.ok(changelogFor('0.6.41').length >= 1)

console.log('test-polish-19 ok')