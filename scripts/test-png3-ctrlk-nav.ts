/** PNG-3: Ctrl+K is a second nav — groups, pins, and stashed Ops commands stay findable. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PALETTE_CATS, PALETTE_PIN_MIN, historyUses, layoutPalette, paletteCategory, pinnedIds } from '../src/shared/palette-rank'
import { paletteFrame, paletteItemIndexes, paletteKeyStep, secondNavOrder } from '../src/shared/palette-nav'
import { PINYIN_ALIASES, buildPaletteEntries, paletteMatch } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS, opsMenuInventory } from '../src/shared/menus'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.51')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-png3-ctrlk-nav\.ts/)

assert.equal(PALETTE_PIN_MIN, 3)
assert.deepEqual(pinnedIds({}), [])
assert.deepEqual(pinnedIds({ settings: { count: 2, last: 1 } }), ['settings'], 'a short history still pins')
assert.equal(historyUses({ a: { count: 1, last: 1 }, b: { count: 1, last: 2 }, c: { count: 1, last: 3 } }), 3)
assert.deepEqual(
  pinnedIds({ a: { count: 1, last: 3 }, b: { count: 1, last: 2 }, c: { count: 1, last: 1 } }),
  [],
  'three one-off uses are not frequent'
)
assert.deepEqual(
  pinnedIds({
    dashboard: { count: 4, last: 2 },
    sftp: { count: 3, last: 1 },
    snippets: { count: 2, last: 9 }
  }),
  ['dashboard', 'sftp']
)
assert.deepEqual(
  pinnedIds({
    dashboard: { count: 3, last: 1 },
    sftp: { count: 3, last: 5 }
  }),
  ['sftp', 'dashboard'],
  'a tie keeps the more recent command first'
)

const entries = buildPaletteEntries(SHARED_MENUS, 'zh-CN')
const bare = layoutPalette(entries, '')
const bareHeaders = bare.rows.flatMap((row) => (row.kind === 'header' ? [row.id] : []))
assert.deepEqual(bareHeaders, [...PALETTE_CATS])
assert.deepEqual(secondNavOrder(bareHeaders), ['connection', 'ops', 'settings', 'help'])
assert.equal(bareHeaders.includes('pinned'), false)

const pinned = layoutPalette(entries, '', {
  dashboard: { count: 4, last: 2 },
  runPlaybook: { count: 3, last: 4 }
})
const headers = pinned.rows.flatMap((row) => (row.kind === 'header' ? [row.id] : []))
assert.equal(headers[0], 'pinned')
assert.deepEqual(headers.slice(1), [...PALETTE_CATS])
assert.deepEqual(secondNavOrder(headers), ['connection', 'ops', 'settings', 'help'])
const pinIds = pinned.rows.flatMap((row, index) => {
  if (row.kind !== 'item') return []
  const nextHeader = pinned.rows.slice(index + 1).find((later) => later.kind === 'header')
  return nextHeader && nextHeader.kind === 'header' && nextHeader.id === 'connection' ? [row.item.id] : []
})
assert.deepEqual(pinIds, ['dashboard', 'runPlaybook'])

function sectionIds(section: string): string[] {
  const ids: string[] = []
  let on = false
  for (const row of bare.rows) {
    if (row.kind === 'header') {
      on = row.id === section
      continue
    }
    if (on) ids.push(row.item.id)
  }
  return ids
}

const opsSection = sectionIds('ops')
const stashed = opsMenuInventory().filter((row) => row.lowFrequency).map((row) => row.id)
assert.ok(stashed.includes('runPlaybook') && stashed.includes('alertRules'))
for (const id of stashed) {
  const cat = paletteCategory(id)
  const section = sectionIds(cat)
  assert.equal(section.includes(id), true, `${id} stays in the ${cat} group`)
  assert.equal(section.filter((item) => item === id).length, 1, `${id} is listed once in ${cat}`)
}
assert.ok(sectionIds('connection').includes('connection'))
assert.ok(sectionIds('settings').includes('settings'))
assert.ok(sectionIds('help').includes('shortcuts'))

const queries: Array<[string, string]> = [
  ['运行剧本', 'runPlaybook'],
  ['Run playbook', 'runPlaybook'],
  ['juben', 'runPlaybook'],
  ['run-playbook', 'runPlaybook'],
  ['告警规则', 'alertRules'],
  ['Alert rules', 'alertRules'],
  ['gjgz', 'alertRules'],
  ['alert-rules', 'alertRules'],
  ['gaojing guize', 'alertRules'],
  ['刷新 Docker', 'refreshDocker'],
  ['Refresh Docker', 'refreshDocker'],
  ['sxd', 'refreshDocker'],
  ['告警历史', 'alertHistory'],
  ['Alert history', 'alertHistory'],
  ['gaojing lishi', 'alertHistory'],
  ['多主机看板', 'dashboard'],
  ['dashboard', 'dashboard'],
  ['kanban', 'dashboard'],
  ['dkb', 'dashboard'],
  ['审计日志', 'auditLog'],
  ['audit log', 'auditLog'],
  ['shenji', 'auditLog'],
  ['导出审计', 'exportAudit'],
  ['audit export', 'exportAudit'],
  ['sjdc', 'exportAudit'],
  ['hgdc', 'exportAudit'],
  ['端口转发', 'portForward'],
  ['port forwarding', 'portForward'],
  ['duankou', 'portForward'],
  ['备份', 'backup'],
  ['backup', 'backup'],
  ['beifen', 'backup']
]
for (const [query, id] of queries) {
  assert.ok(paletteMatch(query, 'zh-CN').includes(id), `zh ${query} → ${id}`)
  assert.ok(paletteMatch(query, 'en').includes(id), `en ${query} → ${id}`)
}
for (const id of ['runPlaybook', 'alertRules', 'refreshDocker', 'alertHistory', 'dashboard', 'auditLog', 'exportAudit', 'portForward', 'backup'] as const) {
  assert.ok((PINYIN_ALIASES[id] ?? '').length > 0, `${id} keeps an alias`)
}

const indexes = paletteItemIndexes(pinned.rows)
const itemStops = indexes.filter((index) => index >= 0)
assert.deepEqual(itemStops, pinned.items.map((_, index) => index))
const dashboardStops = pinned.rows.flatMap((row, index) => (row.kind === 'item' && row.item.id === 'dashboard' ? [indexes[index]] : []))
assert.ok(dashboardStops.length >= 2, 'a pinned command also stays in its group')
assert.notEqual(dashboardStops[0], dashboardStops[1])
assert.deepEqual(paletteItemIndexes([{ kind: 'header' }, { kind: 'item' }, { kind: 'item' }, { kind: 'header' }, { kind: 'item' }]), [-1, 0, 1, -1, 2])

assert.deepEqual(paletteKeyStep('ArrowDown', 0, 4), { type: 'move', index: 1 })
assert.deepEqual(paletteKeyStep('ArrowUp', 0, 4), { type: 'move', index: 0 })
assert.deepEqual(paletteKeyStep('Enter', 0, 3), { type: 'run' })
assert.deepEqual(paletteKeyStep('Enter', 0, 0), { type: 'clear' })
assert.deepEqual(paletteKeyStep('Escape', 1, 0), { type: 'close' })
assert.deepEqual(paletteKeyStep('ArrowDown', 0, 0), { type: 'noop' })

const frame = paletteFrame(1366, 768)
assert.equal(frame.fits, true)
assert.ok(frame.width <= 640)
assert.ok(frame.left >= 8 && frame.left + frame.width <= 1366 - 8)
assert.ok(frame.top >= 8 && frame.top + frame.height <= 768 - 8)

assert.equal(zh('palette.pinned'), '常用')
assert.equal(en('palette.pinned'), 'Frequent')
assert.equal(zh('palette.cat.connection'), '连接')
assert.equal(zh('palette.cat.ops'), '运维')
assert.equal(zh('palette.cat.settings'), '设置')
assert.equal(zh('palette.cat.help'), '帮助')
assert.equal(en('palette.cat.connection'), 'Connection')
assert.equal(en('palette.cat.ops'), 'Ops')
assert.equal(en('palette.cat.settings'), 'Settings')
assert.equal(en('palette.cat.help'), 'Help')
assert.equal(zh('pf4.paletteTitle', { q: 'disk' }), '没有匹配「disk」')
assert.equal(en('pf4.paletteTitle', { q: 'disk' }), 'No match for "disk"')
assert.equal(zh('pf4.paletteDesc'), '换个词，或清空后再试')
assert.equal(en('pf4.paletteDesc'), 'Try another word, or clear the search')
assert.equal(zh('pf4.paletteClear'), '清空搜索')
assert.equal(en('pf4.paletteClear'), 'Clear search')
assert.ok(zh('pf4.hostsDesc').length > 0 && zh('pf4.auditTitle').length > 0)

const palette = readFileSync('src/renderer/src/components/CommandPalette.tsx', 'utf8')
assert.ok(palette.includes('layoutPalette') && palette.includes('paletteItemIndexes') && palette.includes('paletteKeyStep'))
assert.equal(palette.includes('filtered.indexOf'), false)
assert.ok(palette.includes('data-palette-group={row.id}'))
assert.ok(palette.includes("testId=\"palette-empty\"") || palette.includes('testId="palette-empty"'))
assert.ok(palette.includes("t('pf4.paletteTitle'") || palette.includes('t("pf4.paletteTitle"'))
assert.ok(palette.includes("t('pf4.paletteDesc'") || palette.includes('t("pf4.paletteDesc"'))
assert.ok(palette.includes("t('pf4.paletteClear'") || palette.includes('t("pf4.paletteClear"'))
assert.ok(palette.includes('<EmptyState'))
assert.equal(palette.includes('ssh.connect'), false)
assert.equal(palette.includes('window.confirm'), false)
assert.match(palette, /window\.aiss\.snippets/)

const css = [readFileSync('src/renderer/src/styles.css', 'utf8'), readFileSync('src/renderer/src/features.css', 'utf8')].join('\n')
assert.match(css, /\.cmdp\s*\{[^}]*width:\s*min\(640px,\s*92vw\)/)
assert.match(css, /\.cmdp\s*\{[^}]*max-height:\s*min\(64vh,\s*calc\(100vh - 96px\)\)/)
assert.match(css, /\.cmdp\s*\{[^}]*overflow:\s*hidden/)
assert.match(css, /\.cmdp-list\s*\{[^}]*flex:\s*1 1 auto/)
assert.match(css, /\.cmdp-list\s*\{[^}]*min-height:\s*0/)
assert.match(css, /\.cmdp-list\s*\{[^}]*overflow:\s*auto/)
assert.match(css, /\.cmdp-input\s*\{[^}]*flex:\s*none/)
assert.match(css, /\.cmdp-foot\s*\{[^}]*flex:\s*none/)
assert.match(css, /\.cmdp-item\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(css, /\.cmdp-label\s*\{[^}]*white-space:\s*nowrap/)
assert.match(css, /\.cmdp-head\s*\{[^}]*white-space:\s*nowrap/)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const opsButtons = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal((opsButtons.match(/id: '/g) ?? []).length, 3, 'no new toolbar primary')
for (const id of stashed) assert.equal(opsButtons.includes(id), false, `${id} is not a toolbar primary`)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
/** Title line only (`- **…（PNG-3）.**`). A body mention must not count. */
function unreleasedBulletAt(section: string, id: string): number {
  const match = new RegExp(`^- \\*\\*[^\\n*]*（${id}）`, 'm').exec(section)
  return match ? match.index : -1
}
const png3 = unreleasedBulletAt(unreleased, 'PNG-3')
const png6 = unreleasedBulletAt(unreleased, 'PNG-6')
assert.ok(png3 >= 0 && png6 > png3, 'the palette bullet is its own Unreleased title')
const bullet = unreleased.slice(png3, png6)
const title = bullet.slice(0, bullet.indexOf('.**') + 3)
const body = bullet.slice(title.length)
assert.match(title, /^-\s\*\*[^*\n]*（PNG-3）\.\*\*/)
assert.equal(body.includes('PNG-3'), false)
for (const id of [
  'PNG-1',
  'PNG-2',
  'PNG-4',
  'PNG-5',
  'PNG-6',
  'PNG-7',
  'Polish-1',
  'Polish-2',
  'Polish-3',
  'UI-N1',
  'UI-N2',
  'UI-N3',
  'UI-N4',
  'UI-N5',
  'UI-N6',
  'UI-N7',
  'IX-3',
  'IX-5',
  'IX-6',
  'IX-7',
  'L9',
  'L10',
  'A6',
  'W9',
  'A-TFL',
  'A-OM',
  'A-HITL',
  'S1b',
  'S4',
  'S15',
  'TB-1',
  'TB-2',
  'TB-3',
  'Core-A',
  'P3-TO',
  'PF-4',
  'N2'
]) {
  assert.equal(body.includes(id), false, `${id} stays out of the bullet body`)
}
assert.match(bullet, /运行剧本/)
assert.match(bullet, /告警规则/)
assert.match(bullet, /刷新 Docker/)
assert.match(bullet, /告警历史/)
assert.match(bullet, /Public HOLD/)
assert.match(bullet, /0\.4\.4/)

console.log('test-png3-ctrlk-nav ok')
