/** PNG-2: Ops menu stays a short daily list. Low-frequency rows stay in Ctrl+K. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { OPS_MENU_VISIBLE_CAP, SHARED_MENUS, opsMenuInventory, visibleActionIds, visibleMenuItems } from '../src/shared/menus'
import { estimatedMenuHeight, placeMenuDropdown } from '../src/shared/menu-fit'
import { paletteMatch } from '../src/renderer/src/lib/palette'

const ops = SHARED_MENUS.find((m) => m.id === 'ops')!
const inventory = opsMenuInventory()
const visible = visibleActionIds(ops)
const shown = visibleMenuItems(ops)
const low = inventory.filter((row) => row.lowFrequency)
const daily = inventory.filter((row) => !row.lowFrequency)

assert.deepEqual(
  inventory.map((row) => `${row.id}|${row.zh}|${row.en}|${row.lowFrequency ? 'low' : 'daily'}`),
  [
    'opsHome|运维首页|Ops home|daily',
    'alertWorkbench|告警工作台|Alert workbench|daily',
    'playbooks|运维剧本|Playbooks|daily',
    'runPlaybook|运行剧本…|Run playbook…|low',
    'builtinPlaybooks|内置运维剧本…|Built-in playbooks…|low',
    'exportPlaybookPack|导出剧本分享包…|Export playbook pack…|low',
    'importPlaybookPack|导入剧本分享包…|Import playbook pack…|low',
    'dryRunPlaybook|剧本演练（Dry-run）…|Dry-run playbook…|low',
    'resourceMonitor|资源监控|Resource monitor|daily',
    'dashboard|多主机看板|Multi-host dashboard|low',
    'serverTools|服务器工具箱|Server toolbox|daily',
    'openDocker|Docker 容器…|Docker containers…|low',
    'refreshDocker|刷新 Docker|Refresh Docker|low',
    'batchExec|批量执行…|Batch run…|daily',
    'snippets|命令片段|Snippets|daily',
    'builtinSnippets|内置命令片段…|Built-in snippets…|low',
    'inventory|主机档案|Host inventory|daily',
    'alertRules|告警规则…|Alert rules…|low',
    'enableRuleTemplates|告警规则模板…|Alert rule templates…|low',
    'alertHistory|告警历史|Alert history|low',
    'exportPostmortem|导出复盘…|Export postmortem…|low',
    'auditLog|审计日志|Audit log|low',
    'exportAudit|导出审计（合规）|Export audit (compliance)|low',
    'gateTimeline|闸门时间线|Gate timeline|low',
    'maintOpen|维护窗口…|Maintenance window…|low',
    'maintEnd|结束维护…|End maintenance…|low',
    'setDryRunReminder|演练提醒筛选…|Dry-run reminder filter…|low'
  ]
)

assert.ok(visible.length <= OPS_MENU_VISIBLE_CAP, `ops menu has ${visible.length} visible items`)
assert.ok(visible.length < OPS_MENU_VISIBLE_CAP, 'ops menu stays under the stricter IA cap')
assert.equal(visible.length, 8)
assert.deepEqual(visible, daily.map((row) => row.id))
assert.deepEqual(visible, [
  'opsHome',
  'alertWorkbench',
  'playbooks',
  'resourceMonitor',
  'serverTools',
  'batchExec',
  'snippets',
  'inventory'
])

const stashed = ['runPlaybook', 'alertRules', 'refreshDocker', 'alertHistory', 'dashboard', 'auditLog', 'exportAudit']
assert.ok(low.length >= 2, 'at least two low-frequency rows leave the open menu')
for (const id of stashed) {
  assert.ok(low.some((row) => row.id === id), `${id} is marked low-frequency`)
  assert.equal(visible.includes(id), false, `${id} is not a top-level visible row`)
}
assert.ok(low.filter((row) => row.id === 'runPlaybook' || row.id === 'alertRules').length === 2)

for (const row of shown) {
  if (row.type === 'sep') continue
  assert.equal(row.menuHidden, undefined)
}
for (let i = 1; i < shown.length; i++) {
  assert.equal(shown[i - 1]!.type === 'sep' && shown[i]!.type === 'sep', false, 'no doubled separators')
}
assert.notEqual(shown[0]?.type, 'sep')
assert.notEqual(shown[shown.length - 1]?.type, 'sep')

const queries: Array<[string, string]> = [
  ['运行剧本', 'runPlaybook'],
  ['Run playbook', 'runPlaybook'],
  ['run-playbook', 'runPlaybook'],
  ['告警规则', 'alertRules'],
  ['Alert rules', 'alertRules'],
  ['gjgz', 'alertRules'],
  ['刷新 Docker', 'refreshDocker'],
  ['Refresh Docker', 'refreshDocker'],
  ['告警历史', 'alertHistory'],
  ['Alert history', 'alertHistory'],
  ['多主机看板', 'dashboard'],
  ['审计日志', 'auditLog'],
  ['导出审计', 'exportAudit']
]
for (const [query, id] of queries) {
  assert.ok(paletteMatch(query, 'zh-CN').includes(id), `${query} finds ${id}`)
}

const actions = shown.filter((row) => row.type === 'item').length
const seps = shown.filter((row) => row.type === 'sep').length
const menuHeight = estimatedMenuHeight(actions, seps)
const placed = placeMenuDropdown({
  anchorTop: 0,
  anchorBottom: 40,
  anchorLeft: 420,
  menuWidth: 280,
  menuHeight,
  viewportWidth: 1366,
  viewportHeight: 768
})
assert.equal(placed.clipped, false, 'ops menu stays inside 1366×768')
assert.equal(placed.openUp, false)
assert.equal(placed.maxHeight, menuHeight, 'the trimmed menu fits without scrolling a wall')
assert.ok(placed.top + placed.maxHeight <= 768 - 8)
assert.ok(placed.left >= 8 && placed.left + 280 <= 1366 - 8)

const edge = placeMenuDropdown({
  anchorTop: 0,
  anchorBottom: 40,
  anchorLeft: 1200,
  menuWidth: 320,
  menuHeight,
  viewportWidth: 1366,
  viewportHeight: 768
})
assert.equal(edge.clipped, false, 'a menu near the right edge stays on screen')
assert.ok(edge.left + 320 <= 1366 - 8)

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
const itemRule = css.match(/\.titlebar-menu-item\s*\{[^}]*\}/)?.[0] ?? ''
assert.match(itemRule, /white-space:\s*nowrap/)
assert.match(css, /\.titlebar-menu-dropdown\s*\{[^}]*overflow-y:\s*auto/)
assert.match(css, /\.app-titlebar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(css, /\.titlebar-menu-dropdown\s*\{[^}]*max-height:\s*calc\(100vh - 48px\)/)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsEnd = toolbar.indexOf(']', opsStart)
const opsButtons = toolbar.slice(opsStart, opsEnd)
assert.equal((opsButtons.match(/id: '/g) ?? []).length, 3, 'no new toolbar primary')
assert.equal(opsButtons.includes('runPlaybook'), false)
assert.equal(opsButtons.includes('alertRules'), false)

const appMenu = readFileSync('src/main/application-menu.ts', 'utf8')
assert.ok(appMenu.includes('visibleMenuItems'), 'the native menu uses the same visible list')

const menus = readFileSync('src/shared/menus.ts', 'utf8')
assert.equal(menus.includes("it('runPlaybook'"), true)
assert.equal(menus.includes("it('alertRules'"), true)
assert.equal((menus.match(/id: 'ops'/g) ?? []).length, 1)

const home = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
assert.ok(home.includes('l7.runPlaybook') && home.includes('menu.alertRules'))
const workbench = readFileSync('src/renderer/src/components/AlertWorkbenchTab.tsx', 'utf8')
assert.ok(workbench.includes('menu.alertRules'))

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.ok(unreleased.includes('（PNG-2）'))
assert.ok(unreleased.includes('Public HOLD'))
assert.ok(unreleased.includes('0.4.4'))
assert.ok(unreleased.includes('运行剧本'))
assert.ok(unreleased.includes('告警规则'))
assert.ok(unreleased.includes('刷新 Docker'))
assert.ok(unreleased.includes('告警历史'))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.38')

console.log('test-png2-ops-menu ok')
