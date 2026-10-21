/** Polish-13: soft-start product-feel sweep. Package is 0.4.14. No win.fileVersion. Public HOLD. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import { sftpCenterComfortLayout } from '../src/shared/sftp-center-layout'
import {
  SAFETY_DEFAULT_BAND,
  SAFETY_LADDER_BANDS,
  safetyBandForDefaultTier,
  safetyBandTone,
  safetyLadderBand,
  tiersInBand
} from '../src/shared/safety-visibility'
import { DEFAULT_SAFETY_TIER } from '../src/shared/safety-tier'
import { TAB_FADE_PX, TAB_MIN_WIDTH_PX, tabOverflowCues, tabWidthKeepsLabel } from '../src/shared/tab-overflow'
import { LIST_ROW_HEIGHT_COMPACT_PX, LIST_ROW_HEIGHT_PX, listRowHeight } from '../src/shared/list-row'
import {
  OPS_HOME_CARD_CAP,
  OPS_HOME_MAX_WIDTH,
  opsHomeRowLayout
} from '../src/shared/ops-home-density'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.7.0')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-13.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(rawPkg.includes(tipSuggest), false)
assert.equal(rawPkg.includes(rollback), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.4.14'), changelog.indexOf('## v0.4.13'))
assert.ok(note.includes('v0.4.14 soft-start'))
assert.ok(note.includes('Polish-13'))
assert.ok(note.includes('Public HOLD'))
assert.ok(note.includes('不打 tag'))
assert.ok(note.includes('No tag'))
assert.ok(note.includes('No GitHub Release'))
assert.ok(note.includes('fileVersion'))
assert.ok(note.includes('0.4.14-polish13'))
assert.ok(note.includes('0.4.13-polish12'))
assert.ok(changelogFor('0.4.14').length >= 4)
assert.ok(changelogFor('0.4.14').some((entry) => entry.action === 'opsHome' || entry.action === 'about'))
assert.ok(changelogFor('0.4.13').length >= 4)

function published(from: string, to: string): string {
  return changelog.slice(changelog.indexOf(from), changelog.indexOf(to))
}
for (const [from, to, marker] of [
  ['## v0.4.13', '## v0.4.12', 'v0.4.13 soft-start'],
  ['## v0.4.12', '## v0.4.11', 'v0.4.12 soft-start'],
  ['## v0.4.11', '## v0.4.10', 'v0.4.11 soft-start'],
  ['## v0.4.10', '## v0.4.9', 'v0.4.10 soft-start'],
  ['## v0.4.9', '## v0.4.8', 'v0.4.9 soft-start'],
  ['## v0.4.8', '## v0.4.7', 'v0.4.8 soft-start'],
  ['## v0.4.7', '## v0.4.6', 'v0.4.7 soft-start'],
  ['## v0.4.6', '## v0.4.5', 'v0.4.6. Package version is `0.4.6`']
] as const) {
  const body = published(from, to)
  assert.ok(body.startsWith(`${from}\n\n${marker}`), from)
  assert.equal(body.includes('Polish-13'), false, from)
  assert.equal(body.includes('0.4.14-polish13'), false, from)
}

// --- P13-1 SFTP center 1366 ---
const sftpLayout = sftpCenterComfortLayout(1366, 768)
assert.equal(sftpLayout.toolbarNowrap, true)
assert.equal(sftpLayout.driveProminent, true)
assert.equal(sftpLayout.sessionCwdProminent, true)
assert.equal(sftpLayout.listPreviewSplit, true)
assert.equal(sftpLayout.advancedCollapsed, true)
assert.equal(sftpCenterComfortLayout(1920, 1080).advancedCollapsed, false)
const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.ok(sftp.includes('sftpCenterComfortLayout'))
assert.ok(sftp.includes('data-sftp-center-layout'))
assert.ok(sftp.includes('sftp-session-cwd'))
assert.ok(sftp.includes('sftp-advanced'))
assert.ok(sftp.includes('goSessionCwd'))
assert.equal(sftp.includes('hostProfileComfortLayout'), false)

// --- P13-2 safety visibility ---
assert.equal(DEFAULT_SAFETY_TIER, 'confirm')
assert.equal(safetyBandForDefaultTier(), 'confirm')
assert.equal(SAFETY_DEFAULT_BAND, 'confirm')
assert.equal(safetyLadderBand('observe'), 'readonly')
assert.equal(safetyLadderBand('confirm'), 'confirm')
assert.equal(safetyLadderBand('trusted'), 'confirm')
assert.equal(safetyLadderBand('autopilot'), 'autopilot')
assert.deepEqual([...SAFETY_LADDER_BANDS], ['readonly', 'confirm', 'autopilot'])
assert.deepEqual([...tiersInBand('readonly')], ['observe'])
assert.equal(safetyBandTone('readonly'), 'ok')
assert.equal(safetyBandTone('confirm'), 'warn')
assert.equal(safetyBandTone('autopilot'), 'danger')
assert.equal(zh('safety.band.readonly'), '只读')
assert.equal(zh('safety.band.confirm'), '需确认')
assert.equal(zh('safety.band.autopilot'), '全自动')
assert.ok(zh('safety.confirm').includes('确认'))
assert.ok(en('safety.band.confirm').length > 0)
const safetySettings = readFileSync('src/renderer/src/components/SafetyTierSettings.tsx', 'utf8')
// M21: the ladder became three policy radios, each still tagged with its band.
assert.ok(safetySettings.includes('data-testid="ai-policy-radios"'))
assert.ok(safetySettings.includes('safetyLadderBand'))
const aiPanel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(aiPanel.includes('safety-band-badge'))
assert.ok(aiPanel.includes('safetyLadderBand'))

// --- P13-3 tab overflow cues ---
assert.equal(TAB_FADE_PX, 40)
assert.equal(tabWidthKeepsLabel(TAB_MIN_WIDTH_PX), true)
assert.deepEqual(tabOverflowCues({ left: true, right: false }), {
  showLeftArrow: true,
  showRightArrow: false,
  fadeLeft: true,
  fadeRight: false
})
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(styles.includes('black 40px'))
assert.ok(styles.includes('.tab-scroll-btn:not(:disabled)'))
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('tab-scroll-left'))
assert.ok(app.includes('tab-scroll-right'))
assert.ok(app.includes('tabStripWheelDelta'))
assert.match(styles, /\.tab-bar-scroll > \.tab\s*\{[^}]*min-width:\s*96px[^}]*max-width:\s*220px/)

// --- P13-4 list row unify ---
assert.equal(LIST_ROW_HEIGHT_PX, 32)
assert.equal(LIST_ROW_HEIGHT_COMPACT_PX, 24)
assert.equal(listRowHeight(false), 32)
assert.equal(listRowHeight(true), 24)
assert.match(styles, /--list-row-height:\s*32px/)
assert.match(styles, /--list-row-height-compact:\s*24px/)
assert.match(styles, /\.profile-row\s*\{[^}]*min-height:\s*var\(--list-row-height\)/)
assert.match(styles, /\.sftp-table tbody tr\s*\{[^}]*height:\s*var\(--list-row-height\)/)
assert.match(styles, /\.sftp-table tbody tr:hover\s*\{[^}]*var\(--color-row-hover-bg\)/)
assert.doesNotMatch(styles, /\.profile-row:hover\s*\{[^}]*#58a6ff/)

// --- P13-5 type/weight/radius micro ---
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const css = `${styles}\n${features}`
assert.doesNotMatch(css, /font-weight:\s*650/)
assert.doesNotMatch(css, /border-radius:\s*14px/)
assert.match(styles, /--fw-semibold:\s*600/)
assert.match(styles, /--radius-md:/)
assert.match(styles, /--fs-sm:/)
assert.match(styles, /\.session-folder-row\s*\{[^}]*font-weight:\s*var\(--fw-semibold\)/)

// --- P13-6 ops home density ---
// M17: one cap and one column at every width (density is CSS-only).
assert.equal(OPS_HOME_CARD_CAP, 8)
assert.equal(OPS_HOME_MAX_WIDTH, 1080)
assert.equal(opsHomeRowLayout(1920), 'one-line')
assert.equal(opsHomeRowLayout(700), 'two-line')
const ops = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
assert.ok(ops.includes('pickHealthHosts(cardSource, (h) => h.alerting, OPS_HOME_CARD_CAP)'))
assert.equal(ops.includes('data-ops-quiet'), false)
assert.equal(ops.includes('ResizeObserver'), false, 'no JS width fork')
assert.doesNotMatch(ops, /window\.innerHeight/)
assert.equal(ops.includes('OPS_MENU_VISIBLE_CAP'), false)

console.log('test-polish-13 ok')
