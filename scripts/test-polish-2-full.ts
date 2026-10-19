/** Polish-2 complete: PNG-3/4/5/7, UI-N3/N4, refresh icon, AI reply line breaks. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PALETTE_CATS, PALETTE_PIN_MIN, historyUses, layoutPalette, pinnedIds } from '../src/shared/palette-rank'
import { paletteFrame, paletteKeyStep, secondNavOrder } from '../src/shared/palette-nav'
import { buildPaletteEntries, paletteMatch } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'
import { planColdStart, restoreWatchIds } from '../src/shared/cold-start'
import { showConnectionTrouble, troubleshootConnection } from '../src/shared/connect-trouble'
import { statusBarSlots } from '../src/shared/status-bar'
import { loadLayoutPrefs, saveLayoutPrefs } from '../src/renderer/src/lib/layout-prefs'
import { softenNumberedBreaks } from '../src/shared/ai-reply-cards'
import { isEngineerLeak } from '../src/shared/product-error'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; build?: { win?: Record<string, unknown> } }
assert.equal(pkg.version, '0.6.40')
assert.equal('fileVersion' in (pkg.build?.win ?? {}), false)

const early = pinnedIds({ settings: { count: 2, last: 1 } })
assert.deepEqual(early, ['settings'], 'fewer than 3 uses still pins')
assert.equal(historyUses({ a: { count: 1, last: 1 }, b: { count: 1, last: 2 }, c: { count: 1, last: 3 } }), 3)
assert.deepEqual(
  pinnedIds({ a: { count: 1, last: 3 }, b: { count: 1, last: 2 }, c: { count: 1, last: 1 } }),
  [],
  'three one-off uses are not frequent'
)
assert.equal(PALETTE_PIN_MIN, 3)
const frequent = pinnedIds({
  dashboard: { count: 4, last: 2 },
  sftp: { count: 3, last: 1 },
  snippets: { count: 2, last: 9 }
})
assert.deepEqual(frequent, ['dashboard', 'sftp'])

const empty = layoutPalette(buildPaletteEntries(SHARED_MENUS, 'zh-CN'), '', {
  dashboard: { count: 4, last: 2 },
  sftp: { count: 3, last: 1 }
})
const headers = empty.rows.filter((r) => r.kind === 'header').map((r) => (r.kind === 'header' ? r.id : ''))
assert.equal(headers[0], 'pinned')
assert.deepEqual(headers.slice(1), [...PALETTE_CATS])
assert.deepEqual(secondNavOrder(headers), ['connection', 'ops', 'settings', 'help'])

const stashed: Array<[string, string]> = [
  ['刷新 Docker', 'refreshDocker'],
  ['告警历史', 'alertHistory'],
  ['看板', 'dashboard'],
  ['审计', 'auditLog'],
  ['端口转发', 'portForward'],
  ['备份', 'backup'],
  ['Refresh Docker', 'refreshDocker'],
  ['alert history', 'alertHistory'],
  ['dashboard', 'dashboard'],
  ['audit', 'auditLog'],
  ['port forwarding', 'portForward'],
  ['backup', 'backup']
]
for (const [q, id] of stashed) {
  const hit = paletteMatch(q, 'zh-CN').includes(id) || paletteMatch(q, 'en').includes(id)
  assert.ok(hit, `${q} → ${id}`)
}
assert.ok(stashed.length >= 5)

const frame = paletteFrame(1366, 768)
assert.equal(frame.fits, true)
assert.ok(frame.width <= 640)
assert.ok(frame.left + frame.width <= 1366 - 8)
assert.ok(frame.top + frame.height <= 768 - 8)
assert.deepEqual(paletteKeyStep('ArrowDown', 0, 4), { type: 'move', index: 1 })
assert.deepEqual(paletteKeyStep('ArrowUp', 0, 4), { type: 'move', index: 0 })
assert.deepEqual(paletteKeyStep('Enter', 0, 3), { type: 'run' })
assert.deepEqual(paletteKeyStep('Enter', 0, 0), { type: 'clear' })
assert.deepEqual(paletteKeyStep('Escape', 1, 3), { type: 'close' })
assert.deepEqual(paletteKeyStep('ArrowDown', 0, 0), { type: 'noop' })
assert.equal(zh('pf4.paletteClear'), '清空搜索')
assert.ok(en('pf4.paletteTitle', { q: 'disk' }).includes('disk'))

const known = new Set(['p1'])
assert.deepEqual(planColdStart({ mode: 'blank', saved: { profileIds: ['p1'], tabs: [] }, knownProfileIds: known }).kind, 'blank')
const home = planColdStart({
  mode: 'home',
  saved: { profileIds: ['p1'], tabs: [{ kind: 'home', title: 'home', order: 0, active: true }] },
  knownProfileIds: known
})
assert.equal(home.kind, 'home')
const restored = planColdStart({
  mode: 'last',
  saved: {
    profileIds: ['p1', 'gone'],
    tabs: [
      { kind: 'home', title: '运维首页', order: 0, active: false },
      { kind: 'terminal', profileId: 'p1', title: 'db', order: 1, active: true },
      { kind: 'terminal', profileId: 'gone', title: 'old', order: 2 }
    ]
  },
  knownProfileIds: known
})
assert.equal(restored.kind, 'restore')
if (restored.kind === 'restore') {
  assert.equal(restored.skipped, 1)
  assert.equal(restored.tabs.length, 2)
  assert.equal(restored.activeIndex, 1)
}
const emptied = planColdStart({
  mode: 'last',
  saved: { profileIds: [], tabs: [] },
  knownProfileIds: known
})
assert.equal(emptied.kind, 'home')
if (emptied.kind === 'home') assert.equal(emptied.empty, true)
const legacy = planColdStart({
  mode: 'last',
  saved: { profileIds: ['p1'] },
  knownProfileIds: known,
  titleFor: () => 'db'
})
assert.equal(legacy.kind, 'restore')
assert.deepEqual(
  restoreWatchIds(
    [
      { tabId: 'a', view: 'monitor', cold: true },
      { tabId: 'b', view: 'toolbox', cold: true },
      { tabId: 'c', view: 'monitor' }
    ],
    'a'
  ),
  ['a']
)
assert.deepEqual(restoreWatchIds([{ tabId: 'c', view: 'monitor' }], 'c'), [])

const mem = new Map<string, string>()
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v)
}
assert.equal(loadLayoutPrefs(store).showAi, false)
assert.equal(loadLayoutPrefs(store).rightPane, 'ai')
saveLayoutPrefs({ ...loadLayoutPrefs(store), showAi: true, rightPane: 'snippets' }, store)
assert.equal(loadLayoutPrefs(store).showAi, true)
assert.equal(loadLayoutPrefs(store).rightPane, 'snippets')
mem.set('aiss-layout-v1', JSON.stringify({ showSidebar: true }))
assert.equal(loadLayoutPrefs(store).showAi, false, 'a partial cold start does not open the AI pane')

const refused = troubleshootConnection("Error invoking remote method 'ssh:connect': Error: connect ECONNREFUSED 10.0.0.1:22")
assert.equal(refused.id, 'refused')
assert.deepEqual(refused.steps, ['host', 'port', 'net', 'retry'])
assert.equal(troubleshootConnection('All configured authentication methods failed').id, 'auth')
assert.equal(troubleshootConnection('connect ETIMEDOUT 10.0.0.8:22').primary, 'retry')
assert.equal(troubleshootConnection('getaddrinfo ENOTFOUND missing.example').id, 'dns')
assert.equal(troubleshootConnection('[hop 2/3] bastion (10.0.0.2): refused').id, 'jump')
assert.equal(showConnectionTrouble('import', '无法解析该文件'), false)
assert.equal(showConnectionTrouble('unreachable', 'ECONNREFUSED'), true)
for (const id of ['host', 'port', 'net', 'user', 'key', 'jump', 'retry'] as const) {
  assert.equal(isEngineerLeak(zh(`png5.step.${id}`)), false)
  assert.ok(en(`png5.step.${id}`).length > 0)
}
assert.equal(zh('png5.title.refused'), '对方没有在监听')
assert.ok(en('png5.title.auth').length > 0)

assert.deepEqual(statusBarSlots({ syncEnabled: false, phase: 'synced' }), { tray: false, slots: [] })
const synced = statusBarSlots({ syncEnabled: true, phase: 'synced' })
assert.equal(synced.tray, false)
assert.equal(synced.slots.length, 1)
assert.equal(synced.slots[0]?.glyph, '✓')
assert.equal(statusBarSlots({ syncEnabled: true, phase: 'error' }).slots[0]?.glyph, '✕')
assert.equal(statusBarSlots({ syncEnabled: true, phase: 'off' }).slots.length, 0)

assert.equal(softenNumberedBreaks('结论 1) 甲 2) 乙 3) 丙'), '结论\n1) 甲\n2) 乙\n3) 丙')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const foot = app.slice(app.indexOf('data-testid="app-statusbar"'))
assert.ok(foot.includes('data-testid="sync-status"'))
assert.ok(foot.indexOf('data-testid="sync-status"') < foot.indexOf('</footer>'))
assert.ok(!app.includes('className="sync-status"'))
assert.ok(app.includes('planColdStart') && app.includes('restoreWatchIds') && app.includes('ConnectTrouble'))
assert.ok(!app.includes('window.confirm'))
const main = readdirSync('src/main').filter((name) => name.endsWith('.ts')).map((name) => readFileSync(join('src/main', name), 'utf8')).join('\n')
assert.equal(main.split('new Tray').length - 1, 1, 'one brand tray, not a sync tray')
assert.ok(main.includes('setToolTip(title)'))
assert.ok(main.includes('trayHoverTitle'))

const homeSrc = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
const refreshAt = homeSrc.indexOf('data-testid="l7-health-refresh"')
const refresh = homeSrc.slice(refreshAt - 220, refreshAt + 320)
assert.ok(refresh.includes('aria-label={t(\'l7.refresh\')}') || refresh.includes('aria-label={t("l7.refresh")}'))
assert.ok(refresh.includes('name="refresh-cw"'))
assert.ok(!refresh.includes('>{t(\'l7.refresh\')}') && !refresh.includes('>{t("l7.refresh")}'))

const css = [
  readFileSync('src/renderer/src/styles.css', 'utf8'),
  readFileSync('src/renderer/src/features.css', 'utf8')
].join('\n')
assert.match(css, /\.l7-icon-btn\s*\{[^}]*min-width:\s*32px/)
assert.match(css, /\.l7-icon-btn\s*\{[^}]*min-height:\s*32px/)
assert.equal(css.includes('.tab.tab-kind-monitor'), false)
assert.equal(css.includes('.tab.tab-kind-docker'), false)
assert.equal(css.includes('inset 3px 0 0 #06b6d4'), false)
assert.equal(css.includes('inset 3px 0 0 #a855f7'), false)
assert.match(css, /\.modal-panel\s*\{[^}]*var\(--shadow-modal\)/)
assert.match(css, /\.cmdp\s*\{[^}]*var\(--shadow-modal\)/)
assert.match(css, /\.session-context-menu\s*\{[^}]*var\(--shadow-menu\)/)
assert.match(css, /\.titlebar-popover\s*\{[^}]*var\(--shadow-menu\)/)
assert.ok(css.includes('min(640px, 92vw)'))
assert.match(css, /\.app-statusbar\s*\{[^}]*height:\s*24px/)
assert.ok(css.includes('.tab-guard-prod'))

const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
const boot = readFileSync('src/main/core-a-bootstrap.ts', 'utf8')
assert.ok(agent.includes('真实换行') && agent.includes('real newline'))
assert.ok(agent.includes('禁止 Markdown') && agent.includes('no Markdown'))
assert.ok(boot.includes('真实换行'))
assert.ok(!agent.includes('react-markdown'))

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'out' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  assert.equal(/\bwindow\.confirm\b|\bwindow\.alert\b|\bwindow\.prompt\b/.test(text), false, file)
}

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const ops = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal((ops.match(/id: '/g) ?? []).length, 3)

console.log('test-polish-2-full ok')
