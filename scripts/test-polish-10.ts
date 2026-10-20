/** Polish-10: big-company chrome. Package is 0.4.11. No win.fileVersion. Public HOLD. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import { OPS_MENU_VISIBLE_CAP, SHARED_MENUS, opsMenuInventory, visibleActionIds, visibleMenuItems } from '../src/shared/menus'
import { estimatedMenuHeight, placeMenuDropdown } from '../src/shared/menu-fit'
import { PALETTE_CATS, layoutPalette } from '../src/shared/palette-rank'
import { paletteFrame, secondNavOrder } from '../src/shared/palette-nav'
import { statusQuietLabel } from '../src/shared/status-bar'
import { PRODUCT_NAME } from '../src/shared/product'
import { PINYIN_ALIASES, paletteMatch } from '../src/renderer/src/lib/palette'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.6.63')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-10.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')
assert.equal(rawPkg.includes(tipSuggest), false)
assert.equal(rawPkg.includes(rollback), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.4.11'), changelog.indexOf('## v0.4.10'))
assert.ok(note.includes('v0.4.11 soft-start'))
assert.ok(note.includes('Polish-10'))
assert.ok(note.includes('Public HOLD'))
assert.ok(note.includes('不打 tag'))
assert.ok(note.includes('No tag'))
assert.ok(note.includes('No GitHub Release'))
assert.ok(note.includes('fileVersion'))
assert.ok(note.includes('0.4.11-polish10'))
assert.ok(note.includes('0.4.10-polish9'))
assert.ok(note.includes('32×32'))
assert.ok(changelogFor('0.4.11').length >= 4)
assert.ok(changelogFor('0.4.11').some((entry) => entry.action === 'commandPalette'))
assert.ok(changelogFor('0.4.10').length >= 3)

function published(from: string, to: string): string {
  return changelog.slice(changelog.indexOf(from), changelog.indexOf(to))
}
for (const [from, to, marker] of [
  ['## v0.4.10', '## v0.4.9', 'v0.4.10 soft-start'],
  ['## v0.4.9', '## v0.4.8', 'v0.4.9 soft-start'],
  ['## v0.4.8', '## v0.4.7', 'v0.4.8 soft-start'],
  ['## v0.4.7', '## v0.4.6', 'v0.4.7 soft-start'],
  ['## v0.4.6', '## v0.4.5', 'v0.4.6. Package version is `0.4.6`']
] as const) {
  const body = published(from, to)
  assert.ok(body.startsWith(`${from}\n\n${marker}`), from)
  assert.equal(body.includes('Polish-10'), false, from)
  assert.equal(body.includes('0.4.11-polish10'), false, from)
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
assert.match(primary, /background:\s*var\(--color-accent\)/)
assert.doesNotMatch(primary, /accent-dim/)
assert.equal(css.includes('.tab.tab-kind-monitor'), false)
assert.equal(css.includes('inset 3px 0 0 #'), false)
assert.match(styles, /\.app-titlebar\s*\{[^}]*height:\s*40px/)
assert.match(styles, /\.app-titlebar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.tab-bar-scroll > \.tab\s*\{[^}]*min-width:\s*96px[^}]*max-width:\s*220px/)
assert.match(styles, /\.tab-bar\s*\{[^}]*height:\s*36px/)

for (const sel of ['.titlebar-menu-trigger', '.titlebar-btn', '.titlebar-icon-btn', 'button.layout-toggle-btn']) {
  const body = block(styles, sel)
  assert.match(body, /min-height:\s*32px/, `${sel} min-height`)
  assert.match(body, /min-width:\s*32px/, `${sel} min-width`)
  assert.match(body, /(?:^|\n)\s*height:\s*32px/, `${sel} height`)
  assert.match(body, /border-radius:\s*var\(--radius-md\)/, `${sel} radius`)
  assert.doesNotMatch(body, /height:\s*26px|width:\s*26px|border-radius:\s*4px|border-radius:\s*var\(--radius-sm\)/, `${sel} 26×4`)
}
assert.match(block(styles, 'button.layout-toggle-btn'), /border:\s*none/)
assert.match(styles, /\.app-toolbar-layout[\s\S]*?\{[^}]*flex-wrap:\s*nowrap/)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
for (const kind of ['sidebar', 'main', 'ai']) {
  assert.ok(toolbar.includes(`kind: '${kind}'`), kind)
  assert.ok(toolbar.includes(`layout-toggle-${kind}`) || toolbar.includes('layout-toggle-${item.kind}'), kind)
}
assert.equal(toolbar.includes('className="primary"'), false)
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsButtons = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal((opsButtons.match(/id: '/g) ?? []).length, 3)

const resizer = styles.match(/(?:^|[}\n])\s*\.layout-resizer\s*\{([^}]*)\}/m)?.[1] ?? ''
assert.ok(resizer.length > 0, '.layout-resizer')
assert.match(resizer, /width:\s*1px/)
assert.match(resizer, /background:\s*var\(--color-border-muted\)/)
assert.doesNotMatch(resizer, /color-accent|width:\s*[3-9]px/)
const hit = block(styles, '.layout-resizer::after')
assert.match(hit, /width:\s*[57]px/)
const resizerHover = (styles.match(/\.layout-resizer:hover,(?:\s*\.layout-resizer:focus-visible,)?\s*body\.layout-resizing \.layout-resizer\s*\{([^}]*)\}/)?.[1] ?? '')

const status = block(styles, '.app-statusbar')
assert.match(status, /height:\s*28px/)
assert.match(status, /min-height:\s*28px/)
assert.match(status, /max-height:\s*28px/)
assert.match(status, /background:\s*var\(--color-bg-surface\)/)
assert.match(styles, /\.statusbar-quiet\s*\{[^}]*color:\s*var\(--color-text-muted\)/)
assert.equal(statusQuietLabel({ connected: 0, locale: 'zh-CN' }), '就绪')
assert.equal(statusQuietLabel({ connected: 0, locale: 'en' }), 'Ready')
assert.equal(statusQuietLabel({ connected: 0, disconnected: true, locale: 'zh-CN' }), null)
assert.equal(statusQuietLabel({ connected: 2, disconnected: true, locale: 'zh-CN' }), '已连接 2')
assert.equal(statusQuietLabel({ connected: 3, locale: 'en' }), '3 connected')
assert.equal(statusQuietLabel({ connected: -4, locale: 'zh-CN' }), '就绪')
assert.equal(statusQuietLabel({ connected: Number.NaN, locale: 'en' }), 'Ready')
for (const phrase of ['就绪', 'Ready', '已连接 2', '3 connected']) {
  assert.equal(/[\\/]|file:|\.html|\.tsx|node_modules/.test(phrase), false)
}
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('data-testid="statusbar-quiet"'))
assert.ok(app.includes('statusQuietLabel'))
assert.ok(app.includes("t.kind !== 'local'"))
assert.equal(app.includes('console.debug'), false)

const sftp = block(features, '.sftp-pane.is-active')
assert.match(sftp, /outline:\s*none/)
assert.match(sftp, /box-shadow:\s*inset\s+0\s+0\s+0\s+1px\s+var\(--color-accent\)/)
assert.doesNotMatch(sftp, /outline:\s*1px/)
const sftpFocus = block(features, '.sftp-pane.is-active:focus-visible')
assert.match(sftpFocus, /outline:\s*2px\s+solid\s+var\(--color-focus-ring\)/)
const drag = block(styles, '.sftp-browser.is-dragover')
assert.match(drag, /outline:\s*none/)
assert.match(drag, /box-shadow:\s*inset\s+0\s+0\s+0\s+1px\s+var\(--color-accent\)/)
assert.doesNotMatch(drag, /outline:\s*2px/)
const info = block(styles, '.sidebar-info-banner')
assert.match(info, /background:\s*var\(--color-info-muted\)/)
assert.match(info, /color:\s*var\(--color-info\)/)
assert.doesNotMatch(info, /#[0-9a-fA-F]{3,8}\b/)
assert.equal(css.includes('#0b2a4a'), false)
assert.equal(css.includes('#9cdcfe'), false)
assert.doesNotMatch(css, /font-weight:\s*650/)
assert.doesNotMatch(css, /border-radius:\s*14px/)

assert.deepEqual(secondNavOrder([...PALETTE_CATS]), ['connection', 'ops', 'settings', 'help'])
assert.equal(zh('palette.cat.connection'), '连接')
assert.equal(zh('palette.cat.ops'), '运维')
assert.equal(zh('palette.cat.settings'), '设置')
assert.equal(zh('palette.cat.help'), '帮助')
assert.equal(en('palette.cat.connection'), 'Connection')
assert.equal(/^暂无|^无数据/.test(zh('pf4.paletteTitle', { q: 'disk' })), false)
assert.equal(zh('pf4.paletteDesc'), '换个词，或清空后再试')
assert.ok(en('pf4.paletteDesc').length > 0)
const palette = readFileSync('src/renderer/src/components/CommandPalette.tsx', 'utf8')
assert.ok(palette.includes('PRIMARY_NAV'))
assert.ok(palette.includes('cmdp-head--nav'))
assert.ok(palette.includes('<EmptyState'))
assert.ok(palette.includes('testId="palette-empty"'))
assert.match(features, /\.cmdp-head\s*\{[^}]*white-space:\s*nowrap/)
assert.match(features, /\.cmdp-head--nav\s*\{[^}]*color:\s*var\(--color-text-secondary\)/)
const frame = paletteFrame(1366, 768)
assert.equal(frame.fits, true)
const entries = paletteMatch('', 'zh-CN')
assert.ok(entries.includes('connection') && entries.includes('opsHome') && entries.includes('settings') && entries.includes('shortcuts'))
const laid = layoutPalette(
  [{ id: 'settings', label: '设置', group: '设置', hay: '设置', category: 'settings', order: 1 }],
  '',
  { settings: { count: 3, last: 2 } }
)
assert.equal(laid.rows[0]?.kind === 'header' && laid.rows[0].id === 'pinned', true)

const overflowQueries: Array<[string, string]> = [
  ['备份', 'backup'],
  ['backup', 'backup'],
  ['检查更新', 'checkUpdate'],
  ['jcgx', 'checkUpdate'],
  ['更新内容', 'whatsNew'],
  ['whats new', 'whatsNew'],
  ['github', 'github'],
  ['源码', 'github'],
  ['界面主题', 'uiTheme'],
  ['theme', 'uiTheme'],
  ['切换语言', 'toggleLanguage'],
  ['yuyan', 'toggleLanguage'],
  ['运行剧本', 'runPlaybook'],
  ['Run playbook', 'runPlaybook'],
  ['告警规则', 'alertRules']
]
for (const [query, id] of overflowQueries) {
  assert.ok(paletteMatch(query, 'zh-CN').includes(id), `${query} → ${id}`)
  assert.ok(paletteMatch(query, 'en').includes(id), `en ${query} → ${id}`)
}
for (const id of ['backup', 'checkUpdate', 'whatsNew', 'github', 'uiTheme', 'toggleLanguage', 'runPlaybook', 'alertRules'] as const) {
  assert.ok((PINYIN_ALIASES[id] ?? '').length > 0, `${id} alias`)
}

const ops = SHARED_MENUS.find((menu) => menu.id === 'ops')!
const visible = visibleActionIds(ops)
const low = opsMenuInventory().filter((row) => row.lowFrequency)
assert.ok(visible.length <= OPS_MENU_VISIBLE_CAP)
assert.ok(visible.length < OPS_MENU_VISIBLE_CAP)
assert.ok(low.length >= 2)
for (const id of ['runPlaybook', 'alertRules']) {
  assert.equal(visible.includes(id), false, `${id} stays out of the open menu`)
  assert.ok(paletteMatch(id, 'en').includes(id), `${id} stays in Ctrl+K`)
}
const shown = visibleMenuItems(ops)
const menuHeight = estimatedMenuHeight(
  shown.filter((row) => row.type === 'item').length,
  shown.filter((row) => row.type === 'sep').length
)
const placed = placeMenuDropdown({
  anchorTop: 0,
  anchorBottom: 40,
  anchorLeft: 420,
  menuWidth: 280,
  menuHeight,
  viewportWidth: 1366,
  viewportHeight: 768
})
assert.equal(placed.clipped, false)
assert.ok(placed.top + placed.maxHeight <= 768 - 8)
assert.match(styles, /\.titlebar-menu-dropdown\s*\{[^}]*max-height:\s*calc\(100vh - 48px\)/)
assert.equal(opsButtons.includes('runPlaybook'), false)
assert.equal(opsButtons.includes('alertRules'), false)

const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
assert.ok(about.includes('PRODUCT_NAME') && about.includes('GITEE_REPO_URL'))
assert.equal(PRODUCT_NAME, 'AI-SSH-Pro')

console.log('test-polish-10 ok')
