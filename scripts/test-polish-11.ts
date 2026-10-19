/** Polish-11: product-feel sweep. Package is 0.4.12. No win.fileVersion. Public HOLD. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import {
  PRODUCT_MOMENT_ORDER,
  PRODUCT_OVERLAY_ORDER,
  admitProductOverlay,
  escProductTarget,
  pickProductOverlay,
  productBackdropCount,
  productMomentRank
} from '../src/shared/overlay-stack'
import { hostPresentSuppressesWelcome, shouldShowWelcome } from '../src/shared/welcome-prefs'
import { pickValueMoment, valueMomentBlockedByProduct } from '../src/shared/value-moment'
import {
  STATUS_VISIBLE_CAP,
  disconnectStatusSentence,
  fitStatusSlots,
  shareDisconnectCopy,
  statusBarSlots,
  statusQuietLabel
} from '../src/shared/status-bar'
import { PRODUCT_NAME, trayHoverTitle } from '../src/shared/product'
import { isEngineerLeak } from '../src/shared/product-error'
import { QUIET_LOAD_ATTRS, loadingStealsFocus, quietFailureCopy } from '../src/shared/quiet-load'
import { settingsComfortLayout, settingsSynonymClash } from '../src/shared/settings-nav'
import { translate } from '../src/renderer/src/lib/i18n'
import { friendlyError } from '../src/renderer/src/lib/friendly-error'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.51')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-11.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(rawPkg.includes(tipSuggest), false)
assert.equal(rawPkg.includes(rollback), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.51'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.4.12'), changelog.indexOf('## v0.4.11'))
assert.ok(note.includes('v0.4.12 soft-start'))
assert.ok(note.includes('Polish-11'))
assert.ok(note.includes('Public HOLD'))
assert.ok(note.includes('不打 tag'))
assert.ok(note.includes('No tag'))
assert.ok(note.includes('No GitHub Release'))
assert.ok(note.includes('fileVersion'))
assert.ok(note.includes('0.4.12-polish11'))
assert.ok(note.includes('0.4.11-polish10'))
assert.ok(changelogFor('0.4.12').length >= 4)
assert.ok(changelogFor('0.4.12').some((entry) => entry.action === 'whatsNew'))
assert.ok(changelogFor('0.4.12').some((entry) => entry.action === 'settings'))
assert.ok(changelogFor('0.4.11').length >= 4)

function published(from: string, to: string): string {
  return changelog.slice(changelog.indexOf(from), changelog.indexOf(to))
}
for (const [from, to, marker] of [
  ['## v0.4.11', '## v0.4.10', 'v0.4.11 soft-start'],
  ['## v0.4.10', '## v0.4.9', 'v0.4.10 soft-start'],
  ['## v0.4.9', '## v0.4.8', 'v0.4.9 soft-start'],
  ['## v0.4.8', '## v0.4.7', 'v0.4.8 soft-start'],
  ['## v0.4.7', '## v0.4.6', 'v0.4.7 soft-start'],
  ['## v0.4.6', '## v0.4.5', 'v0.4.6. Package version is `0.4.6`']
] as const) {
  const body = published(from, to)
  assert.ok(body.startsWith(`${from}\n\n${marker}`), from)
  assert.equal(body.includes('Polish-11'), false, from)
  assert.equal(body.includes('0.4.12-polish11'), false, from)
}

const welcomeBase = {
  hostCount: 0,
  dismissed: false,
  completed: false,
  releaseNotesOpen: false,
  notesHeld: false,
  replay: false
}

assert.deepEqual([...PRODUCT_MOMENT_ORDER], ['releaseNotes', 'welcome', 'tour'])
assert.ok(productMomentRank('releaseNotes') < productMomentRank('welcome'))
assert.ok(productMomentRank('welcome') < productMomentRank('tour'))
assert.equal(PRODUCT_OVERLAY_ORDER.filter((id) => (PRODUCT_MOMENT_ORDER as readonly string[]).includes(id)).join(','), 'releaseNotes,welcome,tour')
assert.equal(
  pickProductOverlay({
    releaseNotes: true,
    welcome: true,
    tour: true,
    tourExplicit: false,
    quickStart: false,
    quickExplicit: false,
    tasks: false
  }),
  'releaseNotes'
)
assert.equal(
  pickProductOverlay({
    releaseNotes: false,
    welcome: true,
    tour: true,
    tourExplicit: false,
    quickStart: false,
    quickExplicit: false,
    tasks: false
  }),
  'welcome'
)
assert.equal(
  pickProductOverlay({
    releaseNotes: false,
    welcome: false,
    tour: true,
    tourExplicit: true,
    quickStart: false,
    quickExplicit: false,
    tasks: false
  }),
  'tour'
)
assert.equal(admitProductOverlay('welcome', 'welcome'), 'refuse')
assert.equal(admitProductOverlay('welcome', 'tour'), 'queue')
assert.equal(admitProductOverlay('tour', 'welcome', { explicit: true }), 'show')
assert.equal(productBackdropCount('welcome'), 0)
assert.equal(productBackdropCount('releaseNotes'), 1)
assert.equal(escProductTarget({ product: 'welcome', higherChrome: false, modalBackdrops: 0 }), 'welcome')
assert.equal(escProductTarget({ product: 'tour', higherChrome: false, modalBackdrops: 0 }), 'tour')
assert.equal(escProductTarget({ product: 'welcome', higherChrome: true, modalBackdrops: 0 }), null)
assert.equal(escProductTarget({ product: 'tour', higherChrome: false, modalBackdrops: 1 }), null)
assert.equal(escProductTarget({ product: 'releaseNotes', higherChrome: false, modalBackdrops: 1 }), 'releaseNotes')
assert.equal(shouldShowWelcome({ ...welcomeBase, hostCount: 2 }), false)
assert.equal(shouldShowWelcome({ ...welcomeBase, hostCount: 2, replay: true }), true)
assert.equal(shouldShowWelcome({ ...welcomeBase, hostCount: 2, replay: true, releaseNotesOpen: true }), false)
assert.equal(hostPresentSuppressesWelcome(2, false), true)
assert.equal(hostPresentSuppressesWelcome(2, true), false)
assert.equal(hostPresentSuppressesWelcome(0, false), false)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('if (welcomeReplay) return'))
assert.ok(app.includes('helpWelcomeReplay.current = true'))
assert.ok(app.includes('setWelcomeReplay(true)'))
assert.equal((app.match(/data-product-layer/g) ?? []).length, 1)

assert.equal(zh('png.imported', { n: 3 }), '已导入 3 台')
assert.equal(en('png.imported', { n: 3 }), 'Imported 3 hosts')
assert.equal(zh('png.importNext'), '下一步：查看这些主机，或全部连接')
assert.ok(en('png.importNext').toLowerCase().includes('next'))
assert.equal(/^暂无|^无数据/.test(zh('png.importNext')), false)
assert.equal(pickValueMoment({ importCount: 2, firstConnect: true, blocked: false }), 'import')
assert.equal(pickValueMoment({ importCount: null, firstConnect: true, blocked: true }), null)
assert.equal(valueMomentBlockedByProduct('welcome'), true)
assert.equal(valueMomentBlockedByProduct(null), false)
const bar = readFileSync('src/renderer/src/components/ValueMomentBar.tsx', 'utf8')
assert.ok(bar.includes('png.importNext'))
assert.ok(bar.includes('data-testid="png-import-next"'))
assert.equal((bar.match(/className="primary"/g) ?? []).length, 2)
const actions = bar.slice(bar.indexOf('value-moment-actions'))
const importBranch = actions.slice(actions.indexOf("kind === 'import'"), actions.indexOf(') : ('))
const connectBranch = actions.slice(actions.indexOf(') : ('), actions.indexOf('png-never'))
assert.equal((importBranch.match(/className="primary"/g) ?? []).length, 1)
assert.equal((connectBranch.match(/className="primary"/g) ?? []).length, 1)
assert.ok(bar.includes('png-never'))
assert.equal(bar.includes('Modal'), false)
assert.equal(bar.includes('modal-backdrop'), false)

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(styles, /\.app-statusbar\s*\{[^}]*height:\s*28px/)
assert.match(styles, /\.app-statusbar\s*\{[^}]*min-height:\s*28px/)
assert.match(styles, /\.app-statusbar\s*\{[^}]*max-height:\s*28px/)
assert.match(styles, /\.app-statusbar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.equal(STATUS_VISIBLE_CAP, 3)
const crowded = statusBarSlots({
  syncEnabled: true,
  phase: 'syncing',
  recording: true,
  broadcastCount: 2,
  disconnected: true,
  host: 'web-1',
  tabId: 'tab-1'
}).slots
assert.deepEqual(crowded.map((slot) => slot.id), ['disconnect', 'broadcast', 'record', 'sync'])
assert.deepEqual(fitStatusSlots(crowded).map((slot) => slot.id), ['disconnect', 'broadcast', 'record'])
assert.deepEqual(
  fitStatusSlots(crowded.filter((slot) => slot.id !== 'disconnect')).map((slot) => slot.id),
  ['broadcast', 'record', 'sync']
)
assert.ok(app.includes('fitStatusSlots('))
assert.ok(app.includes('data-testid="statusbar-reconnect"'))
assert.ok(app.includes('pf5.reconnect'))
assert.equal(disconnectStatusSentence('web-1', 'zh-CN'), '与 web-1 的连接已断开')
assert.equal(statusQuietLabel({ connected: 0, disconnected: true, locale: 'zh-CN' }), null)
assert.equal(trayHoverTitle(), PRODUCT_NAME)
assert.equal(trayHoverTitle(), 'AI-SSH-Pro')
const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
assert.ok(about.includes('PRODUCT_NAME'))
assert.equal(/[\\/]|file:|\.html|\.tsx|node_modules/.test(trayHoverTitle()), false)

const surfaces: Array<[string, string]> = [
  ['src/renderer/src/App.tsx', 'pf4.hostsDesc'],
  ['src/renderer/src/components/SftpPanel.tsx', 'pf4.sftpTitle'],
  ['src/renderer/src/components/SnippetsPanel.tsx', 'pf4.snipTitle'],
  ['src/renderer/src/components/PortForwardModal.tsx', 'pf4.fwdTitle'],
  ['src/renderer/src/components/AlertWorkbenchTab.tsx', 'pf4.alertTitle'],
  ['src/renderer/src/components/DockerToolboxTab.tsx', 'st.docker.empty']
]
for (const [file, marker] of surfaces) {
  const source = readFileSync(file, 'utf8')
  assert.ok(source.includes('EmptyState'), file)
  assert.ok(source.includes(marker), file)
  assert.equal(source.includes('暂无'), false, file)
}
const tools = readFileSync('src/renderer/src/components/ServerToolsModal.tsx', 'utf8')
assert.ok(tools.includes('testId="toolbox-no-sessions"'))
assert.ok(tools.includes('testId="toolbox-no-ports"'))
assert.ok(tools.includes('testId="toolbox-df-empty"'))
assert.equal(tools.includes('暂无'), false)
assert.equal(tools.includes('className="st-empty"'), false)
assert.equal(tools.includes('className="st-muted"'), false)
const docker = readFileSync('src/renderer/src/components/DockerToolboxTab.tsx', 'utf8')
assert.equal(docker.includes('暂无'), false)
assert.ok(docker.includes('st-docker-group-empty-line'))
assert.match(styles, /\.st-empty,\s*\n\.quiet-load\s*\{[^}]*font-size:\s*var\(--fs-sm\)/)
assert.match(styles, /\.sftp-empty\s*\{[^}]*font-size:\s*var\(--fs-sm\)/)
assert.doesNotMatch(styles, /\.sftp-empty\s*\{[^}]*font-size:\s*1[23]px/)
assert.match(features, /\.st-docker-group-empty\s*\{[^}]*font-size:\s*var\(--fs-sm\)/)
assert.doesNotMatch(features, /\.st-docker-group-empty\s*\{[^}]*font-size:\s*12px/)
assert.equal(/^暂无|^无数据/.test(zh('db.noProjects')), false)
assert.equal(/^暂无|^无数据/.test(zh('rm.noSessions')), false)
const emptyKit = readFileSync('src/renderer/src/components/EmptyState.tsx', 'utf8')
assert.equal((emptyKit.match(/className="primary empty-state-primary"/g) ?? []).length, 1)

const settings = readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8')
assert.ok(settings.includes('useState(false)'))
assert.ok(settings.includes('data-testid="settings-search"'))
assert.ok(settings.includes('data-testid="settings-advanced"'))
assert.ok(settings.includes('data-settings-layout="column"'))
assert.ok(settings.includes('data-settings-anchor'))
assert.ok(settings.includes('id={active ? `settings-${active}` : undefined}'))
assert.equal(settings.includes("t('settings.keepalive')"), false)
assert.equal(settingsSynonymClash(['默认保活 15 秒', '保活']), true)
assert.equal(settingsSynonymClash(['语言', '启动时打开']), false)
const comfort = settingsComfortLayout(1366, 768)
assert.equal(comfort.singleColumn, true)
assert.equal(comfort.searchVisible, true)
assert.equal(comfort.advancedCollapsed, true)
const settingsCss = features.slice(features.indexOf('.settings-shell'), features.indexOf('.cmdp-head'))
assert.match(settingsCss, /\.settings-body\s*\{[^}]*flex-direction:\s*column/)
assert.match(settingsCss, /\.settings-body > section\s*\{[^}]*flex-direction:\s*column/)
assert.match(settingsCss, /\.settings-nav\s*\{[^}]*flex-direction:\s*column/)
assert.equal(settingsCss.includes('display: none'), false)
assert.equal(/flex-direction:\s*row/.test(settingsCss), false)

assert.equal(loadingStealsFocus(), false)
assert.equal(QUIET_LOAD_ATTRS.tabIndex, -1)
assert.equal(QUIET_LOAD_ATTRS['data-quiet-load'], '')
const connecting = app.slice(app.indexOf('session-connecting-banner'))
assert.ok(connecting.includes('{...QUIET_LOAD_ATTRS}'))
assert.equal(
  shareDisconnectCopy('web-1', 'zh-CN', '连接已断开'),
  '与 web-1 的连接已断开'
)
assert.equal(
  shareDisconnectCopy('web-1', 'zh-CN', '连接已断开 · 3s 后自动重连（第 1/3 次）'),
  '与 web-1 的连接已断开 · 3s 后自动重连（第 1/3 次）'
)
assert.equal(
  shareDisconnectCopy('web-1', 'en', 'Disconnected · reconnecting in 3s (try 1/3)'),
  'The connection to web-1 dropped · reconnecting in 3s (try 1/3)'
)
const ipc = "Error invoking remote method 'ssh:connect': Error: connect ECONNREFUSED 10.0.0.1:22"
const refused = quietFailureCopy(ipc, 'zh-CN', 'web-1')
assert.equal(isEngineerLeak(refused.message), false)
assert.equal(refused.offer, 'retry')
assert.equal(/Error invoking|ECONNREFUSED|\bat\s+/.test(refused.message), false)
assert.equal(refused.message, disconnectStatusSentence('', 'zh-CN'))
const auth = quietFailureCopy('All configured authentication methods failed', 'en', 'web-1')
assert.equal(auth.offer, 'settings')
assert.equal(/Error invoking|stack/i.test(auth.message), false)
const stack = quietFailureCopy('TypeError: boom\n    at Module._compile (node:internal/modules:1:1)', 'zh-CN')
assert.equal(stack.offer, 'retry')
assert.equal(stack.message.includes('at Module'), false)
assert.equal(isEngineerLeak(stack.message), false)
const fe = friendlyError(ipc, { locale: 'zh-CN' })
assert.equal(isEngineerLeak(fe.message), false)
assert.equal(fe.message.includes('Error invoking'), false)
const banner = readFileSync('src/renderer/src/components/DisconnectBanner.tsx', 'utf8')
assert.ok(banner.includes('shareDisconnectCopy'))
assert.ok(banner.includes('quietFailureCopy'))
const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.ok(sftp.includes('disconnectStatusSentence'))

console.log('test-polish-11 ok')
