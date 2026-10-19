/** Polish-12: soft-start product-feel sweep. Package is 0.4.13. No win.fileVersion. Public HOLD. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import {
  aiReplyCardForParseFail,
  commandAutoRunAllowed,
  commandRequiresConfirm
} from '../src/shared/ai-reply-cards'
import { hostProfileComfortLayout } from '../src/shared/host-profile-layout'
import {
  TOAST_VISIBLE_CAP,
  admitToast,
  inferToastTheme,
  suppressImportSynonymToast
} from '../src/shared/toast-queue'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.62')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-12.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(rawPkg.includes(tipSuggest), false)
assert.equal(rawPkg.includes(rollback), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.4.13'), changelog.indexOf('## v0.4.12'))
assert.ok(note.includes('v0.4.13 soft-start'))
assert.ok(note.includes('Polish-12'))
assert.ok(note.includes('Public HOLD'))
assert.ok(note.includes('不打 tag'))
assert.ok(note.includes('No tag'))
assert.ok(note.includes('No GitHub Release'))
assert.ok(note.includes('fileVersion'))
assert.ok(note.includes('0.4.13-polish12'))
assert.ok(note.includes('0.4.12-polish11'))
assert.ok(changelogFor('0.4.13').length >= 4)
assert.ok(changelogFor('0.4.13').some((entry) => entry.action === 'about' || entry.action === 'importSessions'))
assert.ok(changelogFor('0.4.12').length >= 4)

function published(from: string, to: string): string {
  return changelog.slice(changelog.indexOf(from), changelog.indexOf(to))
}
for (const [from, to, marker] of [
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
  assert.equal(body.includes('Polish-12'), false, from)
  assert.equal(body.includes('0.4.13-polish12'), false, from)
}

// --- P12-1 AI reply cards ---
assert.equal(aiReplyCardForParseFail(), 'plain')
assert.equal(commandRequiresConfirm('command'), true)
assert.equal(commandRequiresConfirm('end'), false)
assert.equal(commandAutoRunAllowed('low'), false)
assert.equal(commandAutoRunAllowed('high'), false)
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('ai-dark-card'))
assert.ok(panel.includes('ai-card-plain'))
assert.ok(panel.includes('ai-tool-strip'))
assert.ok(panel.includes('ai-risk-badge') || panel.includes('RiskBadge'))
assert.ok(panel.includes('ai-reply-cmd-code'))
assert.equal(panel.includes('autoApproved'), false)
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(styles.includes('.ai-tool-strip'))
assert.ok(styles.includes('.ai-card-plain'))

// --- P12-2 copy tone (≥10) ---
const copyKeys = [
  'pf1.welcome',
  'pf1.headline',
  'pf1.import',
  'pf1.new',
  'pf1.later',
  'about.desc',
  'about.ok',
  'ux37.notConfigured',
  'ux37.setup',
  'banner.connecting',
  'banner.disconnected',
  'toolbar.needSession',
  'ctx.deleteIrreversible',
  'upd.failed',
  'ai.needTab'
] as const
assert.ok(copyKeys.length >= 10)
for (const key of copyKeys) {
  const z = zh(key)
  const e = en(key)
  assert.ok(z.length > 0, key)
  assert.ok(e.length > 0, key)
  assert.equal(/TODO|FIXME|哈哈哈|卖萌|千万别|哇塞/.test(z), false, key)
  assert.equal(/TODO|FIXME/.test(e), false, key)
}
assert.equal(zh('pf1.later'), '稍后')
assert.equal(zh('ux37.setup'), '打开 AI 设置')
assert.equal(zh('about.ok'), '关闭')
assert.equal(zh('banner.connecting', { target: 'web-01' }), '正在连接 web-01')
assert.ok(zh('banner.disconnected').includes('重连') || zh('banner.disconnected').includes('断开'))
assert.equal(zh('ctx.deleteIrreversible').includes('不可撤销'), false)

// --- P12-3 token false-fallback ---
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const shell = styles + '\n' + features
assert.equal(shell.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null)
assert.match(styles, /--danger:\s*var\(--color-danger\)/)
assert.equal(styles.includes('--color-danger: var(--danger)'), false)
assert.match(styles, /--accent:\s*var\(--color-accent\)/)
assert.match(styles, /--border:\s*var\(--color-border-default\)/)
assert.match(styles, /--ok:\s*var\(--color-ok\)/)

// --- P12-4 host profile 1366 ---
const comfort = hostProfileComfortLayout(1366, 768)
assert.equal(comfort.singleColumn, true)
assert.equal(comfort.actionsNowrap, true)
assert.equal(comfort.advancedCollapsed, true)
assert.equal(hostProfileComfortLayout(1920, 1080).singleColumn, false)
const inv = readFileSync('src/renderer/src/components/HostInventoryModal.tsx', 'utf8')
assert.ok(inv.includes('hostProfileComfortLayout'))
assert.ok(inv.includes('data-host-profile-layout'))
assert.ok(inv.includes('host-profile-advanced'))
assert.ok(inv.includes('inv20-advanced'))
assert.ok(features.includes("data-host-profile-layout='column'") || features.includes('[data-host-profile-layout='))

// --- P12-5 toast queue ---
assert.equal(TOAST_VISIBLE_CAP, 2)
const q1 = admitToast([], { id: 1, message: 'a', theme: 'info', kind: 'info' })
const q2 = admitToast(q1, { id: 2, message: 'b', theme: 'error', kind: 'error' })
const q3 = admitToast(q2, { id: 3, message: 'c', theme: 'update', kind: 'info' })
assert.equal(q3.length, 2)
assert.deepEqual(q3.map((t) => t.id), [2, 3])
const merged = admitToast(q2, { id: 4, message: 'b2', theme: 'error', kind: 'error' })
assert.equal(merged.length, 2)
assert.ok(merged.some((t) => t.id === 4 && t.theme === 'error'))
assert.equal(merged.some((t) => t.id === 2), false)
assert.equal(inferToastTheme('已导入 3 台'), 'import')
assert.equal(suppressImportSynonymToast(true, 'import'), true)
assert.equal(suppressImportSynonymToast(true, 'error'), false)
assert.equal(suppressImportSynonymToast(false, 'import'), false)
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('showImportMoment'))
assert.ok(app.includes('P12-5') || app.includes('value strip') || app.includes('!showImportMoment'))
const toastSrc = readFileSync('src/renderer/src/lib/toast.tsx', 'utf8')
assert.ok(toastSrc.includes('admitToast'))
assert.ok(toastSrc.includes('TOAST_VISIBLE_CAP'))
assert.ok(styles.includes('pointer-events: none'))

// --- P12-6 connecting / info banner tokens ---
assert.match(styles, /\.session-disconnect-banner\.session-connecting-banner\s*\{[^}]*var\(--color-info/)
assert.match(styles, /\.sidebar-info-banner\s*\{[^}]*var\(--color-info/)
assert.equal(/#0b2a4a/i.test(styles), false)
assert.equal(/#0b2a4a/i.test(features), false)
assert.ok(app.includes('banner.connecting'))
assert.ok(app.includes('session-connecting-banner'))

console.log('test-polish-12 ok')
