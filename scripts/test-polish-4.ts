/** Polish-4: product feel. One version bump to 0.4.5. Package version is the Win FileVersion; electron-builder 25 rejects win.fileVersion. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aboutCopyLeaksPath, PRODUCT_NAME, trayHoverTitle } from '../src/shared/product'
import { tabKindIcon } from '../src/shared/tab-kind'
import { ICON_NAMES } from '../src/shared/icon-registry'
import { changelogFor } from '../src/shared/changelog'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.41')
assert.equal('fileVersion' in (pkg.build?.win ?? {}), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-4.ts'), true)
assert.equal(pkg.version.split('.').length, 3, 'one semver, no extra micro build')

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.ok(unreleased.includes('Polish-4'))
assert.ok(unreleased.includes('产品感'))
assert.ok(unreleased.includes('0.4.5'))
assert.ok(unreleased.includes('Public HOLD'))
assert.ok(unreleased.includes('不打 tag'))
assert.ok(unreleased.includes('No tag'))
const v045 = changelog.slice(changelog.indexOf('## v0.4.5'), changelog.indexOf('## v0.4.4'))
assert.equal(v045.includes('0.4.6'), false)
assert.equal(v045.includes('0.4.5.1'), false)
assert.ok(changelog.includes('v0.4.5 soft-start'))
assert.ok(unreleased.includes('诊断回复'))
assert.ok(unreleased.includes('monospace strip'))
assert.ok(changelogFor('0.4.5').length >= 5)
assert.ok(changelogFor('0.4.5').some((e) => e.action === 'openAi'))

assert.equal(trayHoverTitle(), PRODUCT_NAME)
assert.equal(aboutCopyLeaksPath(PRODUCT_NAME), false)
assert.equal(zh('about.title', { name: PRODUCT_NAME }), `关于 ${PRODUCT_NAME}`)
assert.equal(en('about.title', { name: PRODUCT_NAME }), `About ${PRODUCT_NAME}`)
for (const key of ['about.local', 'about.license', 'about.check', 'about.whatsNew', 'brand.tagline'] as const) {
  assert.equal(aboutCopyLeaksPath(zh(key)), false, key)
  assert.equal(aboutCopyLeaksPath(en(key)), false, key)
}

const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
const aboutModal = readFileSync('src/renderer/src/components/AboutModal.tsx', 'utf8')
const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const main = readFileSync('src/main/index.ts', 'utf8')
assert.ok(about.includes('PRODUCT_NAME') && about.includes('<BrandMark'))
assert.ok(aboutModal.includes('PRODUCT_NAME') && aboutModal.includes("t('about.title'"))
assert.ok(toolbar.includes('<BrandMark') && toolbar.includes('{PRODUCT_NAME}'))
assert.equal(about.includes('file://'), false)
assert.equal(/[A-Za-z]:\\/.test(about + aboutModal), false)
assert.ok(main.includes('title: trayHoverTitle()'))
assert.equal(main.includes("title: 'AI 调试'"), false)

for (const key of ['ux08.sidebarTitle', 'pf4.sftpTitle', 'pf4.snipTitle', 'pf4.fwdTitle', 'pf4.alertTitle', 'o2.emptyHistory', 'sidebar.empty', 'pf.none', 'snip.empty', 'l7.noAlerts', 'l2.empty'] as const) {
  assert.equal(/^暂无|^无数据/.test(zh(key)), false, key)
  assert.ok(en(key).length > 0, key)
}
assert.equal(zh('o2.emptyHistory'), '还没有告警记录')

const history = readFileSync('src/renderer/src/components/AlertRulesModal.tsx', 'utf8')
assert.ok(history.includes('icon="alert"') && history.includes('o2.emptyHistory'))
assert.equal(history.includes('className="o2-empty"'), false)

const forwards = readFileSync('src/renderer/src/components/PortForwardModal.tsx', 'utf8')
assert.ok(forwards.includes('icon="forward"'))
assert.ok(forwards.includes('sessions.length === 0 && rows.length > 0'))

const welcome = readFileSync('src/renderer/src/components/WelcomePanel.tsx', 'utf8')
assert.equal(welcome.includes('className="primary"'), false)
assert.equal((welcome.match(/className="secondary"/g) ?? []).length, 3)

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const css = `${styles}\n${features}`
assert.equal(css.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null)
assert.equal(css.includes('inset 3px 0 0 #06b6d4'), false)
assert.equal(css.includes('.tab.tab-kind-monitor'), false)
assert.match(styles, /\.tab-kind-icon\s*\{[^}]*var\(--color-text-muted\)/)
assert.match(styles, /\.tab-overflow-menu\s*\{[^}]*var\(--shadow-menu\)/)
assert.match(styles, /\.session-context-menu\s*\{[^}]*var\(--shadow-menu\)/)
assert.match(styles, /\.modal-panel\s*\{[^}]*var\(--shadow-modal\)/)
assert.match(features, /\.st-more-menu\s*\{[^}]*var\(--shadow-menu\)/)
assert.match(features, /\.session-command-more-menu\s*\{[^}]*var\(--shadow-menu\)/)
assert.match(features, /\.ctx-menu\s*\{[^}]*var\(--shadow-menu\)/)
assert.match(styles, /button\.primary\s*\{[^}]*background:\s*var\(--color-accent\)/)
assert.match(styles, /button\.primary\s*\{[^}]*color:\s*var\(--color-text-on-accent\)/)
assert.equal(/button\.primary\s*\{[^}]*accent-dim/.test(styles), false)

const kindSrc = readFileSync('src/shared/tab-kind.ts', 'utf8')
assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(kindSrc), false)
assert.equal(tabKindIcon('sftp'), 'folder')
assert.equal(tabKindIcon('monitor'), 'activity')
assert.equal(tabKindIcon('forward'), 'arrow-left-right')
assert.equal(tabKindIcon('snippets'), 'clipboard-list')
assert.equal(tabKindIcon('alert-workbench'), 'bell')
assert.equal(tabKindIcon(), 'monitor')
assert.equal(tabKindIcon('session'), 'monitor')
for (const view of ['sftp', 'monitor', 'toolbox', 'forward', 'snippets', 'home', 'audit', 'docker']) {
  assert.ok(ICON_NAMES.includes(tabKindIcon(view)), view)
}

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('tabKindIcon(t.view)'))
assert.ok(app.includes('className="tab-kind-icon"'))
assert.equal(app.includes("appVersion || '0.4.4'"), false)
assert.equal(app.includes("|| '0.4.4'"), false)

console.log('test-polish-4 ok')
