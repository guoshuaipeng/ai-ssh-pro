/** Polish-2 soft-start: IX-1 right-panel snippets, IX-2 confirm whitelist, IX-4 palette discoverability. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIRM_WHITELIST, assertConfirmAllowed, undoDurationMs } from '../src/shared/confirm-whitelist'
import { dropCenterSnippetTabs, redirectCenterSnippets } from '../src/shared/right-panel'
import { hideFromDashboard, hostInScope, restoreToDashboard } from '../src/shared/dashboard-scope'
import { PALETTE_CATS, layoutPalette } from '../src/shared/palette-rank'
import { buildPaletteEntries, paletteMatch } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'
import { askConfirm, toastUndo } from '../src/renderer/src/lib/dialogs'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) => translate('en', key, vars)

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.40')

assert.throws(() => assertConfirmAllowed('confirm.notWhitelist'), /whitelist/)
assert.throws(() => assertConfirmAllowed(undefined), /whitelist/)
assert.throws(() => askConfirm({ id: 'confirm.nope' as never, title: 'x', confirmText: '删除' }))
assert.throws(() => askConfirm('title', 'body', { danger: true, okLabel: '删除' } as never))
assert.throws(() => askConfirm({ id: 'confirm.deleteConnections', title: 'x', confirmText: '确定', danger: true }))
assert.throws(() => undoDurationMs(4999))
assert.equal(undoDurationMs(8000), 8000)
toastUndo({ message: '已删除', undo: () => undefined })

const sources = walk('src')
for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  assert.equal(/\bwindow\.confirm\b|\bwindow\.alert\b|\bwindow\.prompt\b/.test(text), false, file)
  const re = /askConfirm\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 24), m.index)
    if (before.includes('function ')) continue
    const slice = text.slice(m.index, m.index + 700)
    const id = slice.match(/id:\s*'([^']+)'/)
    assert.ok(id, `${file} askConfirm missing whitelist id`)
    assert.ok(CONFIRM_WHITELIST.has(id[1]!), `${file} id ${id[1]}`)
  }
}

for (const id of [
  'confirm.deleteConnections',
  'confirm.deleteGroups',
  'confirm.clearAudit',
  'confirm.dangerCommand',
  'confirm.stopService',
  'confirm.overwriteImportSecrets',
  'confirm.prodGuardTempLift',
  'confirm.deleteRecordings',
  'confirm.playbookDestructive',
  'confirm.syncOverwrite',
  'confirm.batchJumpOverride',
  'confirm.quitWithDirty',
  'confirm.closeLiveTerminal'
]) {
  assert.ok(CONFIRM_WHITELIST.has(id), id)
}

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes("openRightPanelRef.current('snippets')") || app.includes('openRightPanel('))
assert.ok(!app.includes("openSettingsTab('snippets')"))
assert.ok(app.includes('redirectCenterSnippets') && app.includes('dropCenterSnippetTabs'))
assert.ok(app.includes('data-testid="right-panel"'))
assert.ok(app.includes('toastUndo'))
assert.ok(app.includes('confirm.deleteConnections') && app.includes('confirm.clearAudit') && app.includes('confirm.closeLiveTerminal'))
assert.equal(redirectCenterSnippets('snippets'), 'snippets')
assert.equal(redirectCenterSnippets('sftp'), null)
const migrated = dropCenterSnippetTabs([{ view: 'session' }, { view: 'snippets' }, { view: 'home' }])
assert.equal(migrated.hadSnippets, true)
assert.deepEqual(migrated.tabs.map((t) => t.view), ['session', 'home'])

const snippets = readFileSync('src/renderer/src/components/SnippetsPanel.tsx', 'utf8')
assert.ok(snippets.includes('pf4.snipTitle') && snippets.includes('ux08.snipNew') && snippets.includes('toastUndo'))
assert.ok(snippets.includes('aiss-focus-terminal'))
const term = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
assert.ok(term.includes('ctx.insertSnippet') && term.includes('ctx.allSnippets') && term.includes('ctx.saveAsSnippet'))
assert.ok(term.includes('aiss-open-right-panel'))

const hidden = hideFromDashboard({ mode: 'all' }, 'p1')
assert.equal(hostInScope(hidden, { profileId: 'p1' }), false)
assert.equal(hostInScope(restoreToDashboard(hidden, 'p1'), { profileId: 'p1' }), true)

const aliases: Array<[string, string]> = [
  ['生产防护', 'openProdGuard'],
  ['production guard', 'openProdGuard'],
  ['prod-guard', 'openProdGuard'],
  ['scfh', 'openProdGuard'],
  ['看板', 'dashboard'],
  ['dashboard', 'dashboard'],
  ['dkb', 'dashboard'],
  ['跳板', 'setJumpHosts'],
  ['jump', 'setJumpHosts'],
  ['proxyjump', 'setJumpHosts'],
  ['bastion', 'setJumpHosts'],
  ['云同步', 'cloudSync'],
  ['cloud-sync', 'cloudSync'],
  ['yuntb', 'cloudSync'],
  ['gist', 'cloudSync'],
  ['告警规则', 'alertRules'],
  ['alert-rules', 'alertRules'],
  ['gjgz', 'alertRules'],
  ['rules', 'alertRules']
]
for (const [q, id] of aliases) {
  const hit = paletteMatch(q, 'zh-CN').includes(id) || paletteMatch(q, 'en').includes(id)
  assert.ok(hit, `${q} → ${id}`)
}

const empty = layoutPalette(buildPaletteEntries(SHARED_MENUS, 'zh-CN'), '', {
  dashboard: { count: 4, last: 2 },
  sftp: { count: 3, last: 1 },
  snippets: { count: 2, last: 1 },
  cloudSync: { count: 2, last: 1 },
  auditLog: { count: 1, last: 1 },
  about: { count: 1, last: 1 }
})
const headers = empty.rows.filter((r) => r.kind === 'header').map((r) => (r.kind === 'header' ? r.id : ''))
assert.equal(headers[0], 'pinned')
assert.deepEqual(headers.slice(1), [...PALETTE_CATS])
const pinned = empty.rows.filter((r) => r.kind === 'item').slice(0, 6)
const pinnedCount = empty.rows.findIndex((r, i) => i > 0 && r.kind === 'header' && r.id !== 'pinned')
assert.ok(pinnedCount > 1 && pinnedCount <= 6, 'frequent rows stay at or under 5')
assert.ok(pinned.length > 0)

assert.equal(zh('right.snippets'), '片段')
assert.equal(en('right.snippets'), 'Snippets')
assert.equal(zh('right.ai'), 'AI')
assert.equal(zh('help.searchPalette'), '在命令面板中搜索')
assert.equal(en('help.searchPalette'), 'Search in the command palette')
assert.ok(zh('toolbar.searchField').includes('Ctrl+K'))
assert.ok(en('toolbar.searchField').includes('Ctrl+K'))
assert.equal(zh('undo.action'), '撤销')
assert.equal(en('undo.action'), 'Undo')
assert.ok(zh('pf4.snipTitle').length > 0 && en('pf4.snipTitle').length > 0)
assert.equal(zh('pf1.import'), '导入会话…')
assert.equal(zh('pf1.new'), '新建连接')
assert.equal(zh('pf1.demo'), '连接演示主机')
assert.ok(zh('pf1.hint').includes('Ctrl+K'))

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const ops = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.ok(ops.includes('resourceMonitor') && ops.includes('serverTools') && ops.includes('sftp'))
assert.ok(!ops.includes('snippets') && !ops.includes('portForward'))
assert.ok(toolbar.includes('toolbar.searchField') && toolbar.includes('data-testid="toolbar-palette-field"'))
assert.ok(toolbar.includes('titlebar-search-btn'))

const welcome = readFileSync('src/renderer/src/components/WelcomePanel.tsx', 'utf8')
assert.ok(welcome.includes('className="secondary"') && !welcome.includes('className="primary"'))
assert.ok(welcome.includes('data-command="importSessions"') && welcome.includes('data-command="connection"') && welcome.includes('data-command="demoHost"'))

const shortcuts = readFileSync('src/renderer/src/components/ShortcutsModal.tsx', 'utf8')
assert.ok(shortcuts.includes('help.searchPalette') && shortcuts.includes('data-testid="help-open-palette"'))
const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(css.includes('min(640px, 92vw)') && css.includes('--color-bg-elevated') && css.includes('.right-pane-tabs'))

console.log('test-polish-2-soft ok')
