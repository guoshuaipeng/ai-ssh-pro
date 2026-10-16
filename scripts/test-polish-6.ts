/** Polish-6: titlebar chrome. Current package follows later bumps. No win.fileVersion. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import { SHARED_MENUS } from '../src/shared/menus'
import { LAYOUT_DEFAULTS } from '../src/renderer/src/lib/layout-prefs'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.4.9')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal(pkg.scripts.test.includes('scripts/test-polish-6.ts'), true)
assert.equal(tipSuggest, '0.4.9-polish8')
assert.equal(rollback, '0.4.8-polish7')
assert.equal(rawPkg.includes(tipSuggest), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const note = changelog.slice(changelog.indexOf('## v0.4.7'), changelog.indexOf('## v0.4.6'))
const prior = changelog.slice(changelog.indexOf('## v0.4.6'), changelog.indexOf('## v0.4.5'))
assert.ok(note.includes('v0.4.7 soft-start'))
assert.ok(note.includes('Polish-6'))
assert.ok(note.includes('Public HOLD'))
assert.ok(note.includes('不打 tag'))
assert.ok(note.includes('No tag'))
assert.ok(note.includes('No GitHub Release'))
assert.ok(note.includes('fileVersion'))
assert.equal(note.includes('0.4.7.1'), false)
assert.ok(prior.includes('v0.4.6. Package version is `0.4.6`'))
assert.equal(prior.includes('soft-start'), false)
assert.equal(prior.includes('Public HOLD'), false)
assert.equal(prior.includes('不打 tag'), false)
assert.ok(prior.includes('Polish-5'))
assert.ok(changelogFor('0.4.7').length >= 4)
assert.ok(changelogFor('0.4.6').some((entry) => entry.action === 'serverTools'))
assert.ok(changelogFor('0.4.7').some((entry) => entry.action === 'toggleSplit'))

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.ok(toolbar.includes('layout-toggle-btn'))
assert.ok(toolbar.includes('LayoutToggleIcon'))
assert.ok(toolbar.includes('app-toolbar-layout'))
assert.ok(toolbar.includes("onMenuAction(item.id)"))
for (const id of ['toggleSidebar', 'toggleMain', 'toggleAi']) {
  assert.ok(toolbar.includes(`id: '${id}'`), id)
}
const overflowAt = toolbar.indexOf('data-testid="toolbar-overflow"')
const menuAt = toolbar.indexOf('data-testid="toolbar-more"')
assert.ok(overflowAt > 0 && menuAt > overflowAt)
const overflowBtn = toolbar.slice(overflowAt, menuAt)
assert.match(overflowBtn, /<span aria-hidden>⋯<\/span>\s*<\/button>/)
assert.equal(overflowBtn.includes("t('toolbar.more')"), false)
assert.equal(overflowBtn.includes('更多'), false)
assert.equal(overflowBtn.includes('tb-label'), false)
const primary = toolbar.slice(0, overflowAt)
for (const id of ['connection', 'commandPalette']) {
  assert.ok(primary.includes(`data-tool="${id}"`), id)
}
for (const id of ['resourceMonitor', 'serverTools', 'sftp']) {
  assert.ok(primary.includes(`id: '${id}'`), id)
}
const overflowMenu = toolbar.slice(menuAt)
for (const hidden of ['connection', 'commandPalette', 'resourceMonitor', 'serverTools', 'sftp']) {
  assert.equal(overflowMenu.includes(`'${hidden}'`), false, hidden)
}

const menus = SHARED_MENUS.map((menu) => menu.label.zh)
for (const label of ['文件', '编辑', '查看', '会话', '运维', 'AI', '帮助']) {
  assert.ok(menus.includes(label), label)
}
const view = SHARED_MENUS.find((menu) => menu.id === 'view')
assert.ok(view)
const viewIds = view.items.flatMap((item) => (item.type === 'item' ? [item.id] : []))
for (const id of ['toggleSidebar', 'toggleMain', 'toggleAi', 'toggleSplit']) {
  assert.ok(viewIds.includes(id), id)
}
assert.equal(view.items.find((item) => item.type === 'item' && item.id === 'toggleSplit')?.label.zh, '分屏')
assert.equal(view.items.find((item) => item.type === 'item' && item.id === 'toggleSplit')?.label.en, 'Split view')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /const \[splitEnabled, setSplitEnabled\] = useState\(false\)/)
assert.equal(app.split('data-testid="tab-split"').length - 1, 1)
const splitAt = app.indexOf('data-testid="tab-split"')
const splitBtn = app.slice(splitAt, splitAt + 700)
assert.ok(splitBtn.includes("handleTitlebarMenuAction('toggleSplit')"))
assert.ok(splitBtn.includes("tr('tab.split')"))
assert.ok(splitBtn.includes("tr('tab.splitExit')"))
assert.equal(LAYOUT_DEFAULTS.showMain, true)
assert.equal(LAYOUT_DEFAULTS.showAi, false)

assert.equal(zh('tab.split'), '分屏')
assert.equal(en('tab.split'), 'Split view')
assert.equal(zh('tab.splitExit'), '取消分屏')
assert.equal(en('tab.splitExit'), 'Exit split view')
assert.equal(zh('toolbar.overflow').includes('更多'), false)
assert.equal(en('toolbar.overflow').toLowerCase().includes('more'), false)
assert.ok(zh('toolbar.overflow').length > 0)
assert.ok(en('toolbar.overflow').length > 0)

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(styles, /button\.layout-toggle-btn\s*\{[^}]*width:\s*24px/)
assert.match(styles, /button\.layout-toggle-btn\s*\{[^}]*border:\s*none/)
assert.match(styles, /\.app-toolbar-layout\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.app-titlebar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.app-titlebar\s*\{[^}]*height:\s*40px/)
assert.match(styles, /\.app-titlebar\s*\{[^}]*max-height:\s*40px/)
assert.match(styles, /\.app-titlebar\s*\{[^}]*min-width:\s*0/)
assert.match(styles, /\.titlebar-menu-trigger\s*\{[^}]*font-weight:\s*var\(--fw-medium\)/)
assert.match(styles, /\.titlebar-menu-trigger\s*\{[^}]*font-size:\s*var\(--fs-sm\)/)
assert.match(styles, /\.app-toolbar-brand\s*\{[^}]*font-weight:\s*var\(--fw-bold\)/)
assert.match(styles, /\.app-toolbar-version\s*\{[^}]*font-weight:\s*var\(--fw-regular\)/)
assert.match(styles, /\.app-toolbar-version\s*\{[^}]*color:\s*var\(--color-text-muted\)/)
assert.match(styles, /\.tab-split-btn\s*\{[^}]*width:\s*24px/)
assert.match(styles, /button\.titlebar-menu-trigger:hover:not\(:disabled\)[\s\S]*?background:\s*var\(--color-row-hover-bg\)/)

console.log('test-polish-6 ok')
