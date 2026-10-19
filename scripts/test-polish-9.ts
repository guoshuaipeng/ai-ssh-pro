/** Polish-9: product-feel chrome. Package is 0.4.10. No win.fileVersion. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import { aboutCopyLeaksPath, PRODUCT_NAME } from '../src/shared/product'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.47')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-9.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(rawPkg.includes(tipSuggest), false)
assert.equal(rawPkg.includes(rollback), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.6.47'))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.4.10'), changelog.indexOf('## v0.4.9'))
assert.ok(note.includes('v0.4.10 soft-start'))
assert.ok(note.includes('Polish-9'))
assert.ok(note.includes('Public HOLD'))
assert.ok(note.includes('不打 tag'))
assert.ok(note.includes('No tag'))
assert.ok(note.includes('No GitHub Release'))
assert.ok(note.includes('fileVersion'))
assert.ok(note.includes('0.4.10-polish9'))
assert.ok(note.includes('0.4.9-polish8'))
assert.ok(changelogFor('0.4.10').length >= 3)
assert.ok(changelogFor('0.4.9').length >= 4)

function published(from: string, to: string): string {
  return changelog.slice(changelog.indexOf(from), changelog.indexOf(to))
}
for (const [from, to, marker] of [
  ['## v0.4.9', '## v0.4.8', 'v0.4.9 soft-start'],
  ['## v0.4.8', '## v0.4.7', 'v0.4.8 soft-start'],
  ['## v0.4.7', '## v0.4.6', 'v0.4.7 soft-start'],
  ['## v0.4.6', '## v0.4.5', 'v0.4.6. Package version is `0.4.6`']
] as const) {
  const body = published(from, to)
  assert.ok(body.startsWith(`${from}\n\n${marker}`), from)
  assert.equal(body.includes('Polish-9'), false, from)
  assert.equal(body.includes('0.4.10-polish9'), false, from)
}

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const css = `${styles}\n${features}`
assert.equal(css.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null)

function block(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g')
  const parts: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) parts.push(match[1]!)
  assert.ok(parts.length > 0, selector)
  return parts.join('\n')
}

const primary = block(styles, 'button.primary')
const hover = block(styles, 'button.primary:hover:not(:disabled)')
assert.match(primary, /background:\s*var\(--color-accent\)/)
assert.match(primary, /color:\s*var\(--color-text-on-accent\)/)
assert.doesNotMatch(primary, /accent-dim/)
assert.match(hover, /background:\s*var\(--color-accent-hover\)/)
assert.match(hover, /border-color:\s*var\(--color-accent-hover\)/)
assert.equal(css.includes('inset 3px 0 0 #'), false)
assert.equal(css.includes('.tab.tab-kind-monitor'), false)
assert.equal(css.includes('.tab.tab-kind-docker'), false)
assert.equal(css.includes('.tab.tab-kind-sftp'), false)
assert.match(styles, /\.tab-kind-icon\s*\{[^}]*var\(--color-text-muted\)/)
assert.match(styles, /\.tab\.active \.tab-kind-icon\s*\{[^}]*var\(--color-text-secondary\)/)

const elevated = [
  [styles, '.modal-panel', '--shadow-modal'],
  [styles, '.tab-overflow-menu', '--shadow-menu'],
  [styles, '.session-context-menu', '--shadow-menu'],
  [styles, '.session-context-submenu', '--shadow-menu'],
  [styles, '.cmdp', '--shadow-modal'],
  [styles, '.terminal-find-bar', '--shadow-sm'],
  [styles, '.titlebar-menu-dropdown', '--shadow-menu'],
  [features, '.titlebar-popover', '--shadow-menu'],
  [features, '.titlebar-hamburger-menu', '--shadow-menu'],
  [features, '.st-more-menu', '--shadow-menu'],
  [features, '.session-command-more-menu', '--shadow-menu'],
  [features, '.ctx-menu', '--shadow-menu'],
  [features, '.tab-context-menu', '--shadow-menu'],
  [features, '.ux60-card', '--shadow-modal'],
  [features, '.command-input-field .command-input-suggest', '--shadow-menu']
] as const
for (const [source, selector, shadow] of elevated) {
  const body = block(source, selector)
  assert.match(body, new RegExp(`box-shadow:\\s*var\\(${shadow}\\)`), selector)
  assert.match(body, /background:\s*var\(--color-bg-elevated\)/, selector)
  assert.match(body, /border:\s*1px solid var\(--color-border-default\)/, selector)
  assert.doesNotMatch(body, /box-shadow:\s*0\b/, selector)
}
const menus = block(features, '.l7-more, .l2-prefs')
assert.match(menus, /box-shadow:\s*var\(--shadow-menu\)/)
assert.match(menus, /background:\s*var\(--color-bg-elevated\)/)
assert.doesNotMatch(menus, /box-shadow:\s*0\b/)

const welcome = readFileSync('src/renderer/src/components/WelcomePanel.tsx', 'utf8')
assert.equal(welcome.includes('className="primary"'), false)
assert.equal((welcome.match(/className="secondary"/g) ?? []).length, 3)

for (const key of [
  'ux08.sidebarTitle',
  'pf4.sftpTitle',
  'pf4.snipTitle',
  'pf4.fwdTitle',
  'pf4.alertTitle',
  'st.docker.empty',
  'docker.missing',
  'ui.152',
  'ui.170',
  'ui.190',
  'ui.257',
  'app.noFolders',
  'dbg.6',
  'snip.noMatch'
] as const) {
  assert.equal(/^暂无|^无数据/.test(zh(key)), false, key)
  assert.ok(en(key).length > 0, key)
}

const hosts = readFileSync('src/renderer/src/App.tsx', 'utf8')
const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
const snippets = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
const forward = readFileSync('src/renderer/src/components/PortForwardModal.tsx', 'utf8')
const alerts = readFileSync('src/renderer/src/components/AlertWorkbenchTab.tsx', 'utf8')
const docker = readFileSync('src/renderer/src/components/DockerToolboxTab.tsx', 'utf8')
const inventory = readFileSync('src/renderer/src/components/HostInventoryModal.tsx', 'utf8')
const dockerPanel = readFileSync('src/renderer/src/components/DockerPanel.tsx', 'utf8')
assert.ok(hosts.includes('testId="sidebar-empty"') && hosts.includes('icon="host"'))
assert.ok(sftp.includes('icon="sftp"') && sftp.includes('<EmptyState'))
assert.ok(snippets.includes('testId="snippets-empty"') && snippets.includes('testId="snippets-nomatch"'))
assert.ok(forward.includes('icon="forward"'))
assert.ok(alerts.includes('icon="alert"'))
assert.ok(docker.includes('testId="toolbox-docker-empty"') && docker.includes('icon="docker"'))
assert.ok(inventory.includes('testId="inventory-empty"'))
assert.ok(dockerPanel.includes('testId="docker-services-empty"'))
assert.equal(docker.includes('暂无'), false)

const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
const aboutModal = readFileSync('src/renderer/src/components/AboutModal.tsx', 'utf8')
const settings = readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8')
assert.ok(about.includes('PRODUCT_NAME') && about.includes('<BrandMark'))
assert.ok(about.includes("t('brand.tagline')"))
assert.ok(about.includes('about.versionLine') && about.includes('about-check') && about.includes('about-notes'))
assert.ok(about.includes('data-testid="about-github"') && about.includes('className="secondary"'))
assert.ok(about.includes('GITEE_REPO_URL') && about.includes('data-testid="about-gitee"'))
assert.ok(aboutModal.includes('<AboutBlock') && settings.includes('<AboutBlock'))
assert.equal(about.includes('file://'), false)
assert.equal(/[A-Za-z]:\\/.test(about + aboutModal), false)
assert.equal(about.includes('window.confirm'), false)
for (const key of ['about.gitee', 'about.local', 'about.license', 'brand.tagline', 'about.check'] as const) {
  assert.equal(aboutCopyLeaksPath(zh(key)), false, key)
  assert.equal(aboutCopyLeaksPath(en(key)), false, key)
}
assert.equal(zh('about.gitee'), 'Gitee 源码')
assert.equal(en('about.gitee'), 'Gitee source')
assert.equal(zh('about.title', { name: PRODUCT_NAME }), `关于 ${PRODUCT_NAME}`)
assert.match(features, /\.about-actions\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(features, /\.about-tagline\s*\{[^}]*white-space:\s*nowrap/)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
for (const kind of ['sidebar', 'main', 'ai']) {
  assert.ok(toolbar.includes(`kind: '${kind}'`), kind)
}
assert.match(styles, /\.app-titlebar\s*\{[^}]*height:\s*40px/)
assert.match(styles, /\.app-titlebar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.tab-bar\s*\{[^}]*height:\s*36px/)
assert.match(styles, /\.tab-bar-scroll > \.tab\s*\{[^}]*flex:\s*0\s*0\s*auto/)
assert.match(styles, /\.tab-bar-scroll > \.tab\s*\{[^}]*min-width:\s*188px/)

console.log('test-polish-9 ok')
