/** S1b: redacted audit compliance export (CSV / Markdown, local save only). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { appendAudit, loadAudit, redactAuditText, type AuditEvent } from '../src/shared/audit-log'
import {
  auditExportCanSave,
  auditExportFileName,
  auditWindowBounds,
  peekAuditExportContext,
  renderAuditCompliance,
  selectAuditExport,
  setAuditExportContext,
  type AuditExportCopy
} from '../src/shared/audit-export'
import { paletteCategory } from '../src/shared/palette-rank'
import { SHARED_MENUS, visibleActionIds } from '../src/shared/menus'
import { buildPaletteEntries, paletteMatch } from '../src/renderer/src/lib/palette'
import { I18nProvider, translate } from '../src/renderer/src/lib/i18n'
import AuditExportModal from '../src/renderer/src/components/AuditExportModal'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.49')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-s1b\.ts/)

const secrets: Array<[string, string]> = [
  ['echo password=hunter2-s1b id', 'hunter2-s1b'],
  ['token=tok-s1b-zzz', 'tok-s1b-zzz'],
  ['Authorization: Bearer bearer-s1b-zzz', 'bearer-s1b-zzz'],
  ['aws AKIAIOSFODNN7EXAMPLE ok', 'AKIAIOSFODNN7EXAMPLE'],
  ['-----BEGIN RSA PRIVATE KEY-----\npriv-s1b-material\n-----END RSA PRIVATE KEY-----', 'priv-s1b-material'],
  ['mysql --password flag-s1b-zzz', 'flag-s1b-zzz'],
  ["curl -p'hide-s1b-zzz'", 'hide-s1b-zzz'],
  ['passwd=pw-s1b-zzz', 'pw-s1b-zzz']
]
assert.ok(secrets.length >= 6, 'S1b-4 at least six redaction patterns')
for (const [input, secret] of secrets) {
  const out = redactAuditText(input)
  assert.equal(out.includes(secret), false, secret)
  assert.equal(out.includes('-----BEGIN'), false, secret)
  assert.ok(out.includes('••••'), secret)
}

const mem = new Map<string, string>()
const store = {
  getItem: (key: string) => mem.get(key) ?? null,
  setItem: (key: string, value: string) => void mem.set(key, value)
}
appendAudit(
  {
    type: 'command',
    host: 'web',
    outcome: 'allowed',
    source: 'terminal',
    detail: secrets.map(([input]) => input).join('\n')
  },
  store,
  1_700_000_000_000
)
const stored = loadAudit(store)[0]!
for (const [, secret] of secrets) assert.equal(stored.detail.includes(secret), false, `stored ${secret}`)

const now = new Date(2026, 9, 15, 15, 30, 0).getTime()
const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour, 0, 0).getTime()
const todayAt = at(9, 15, 9)
const within7 = at(9, 12, 12)
const within30 = at(9, 5, 12)
const older = at(8, 5, 12)
const leak = 'leak-s1b-outside'

function row(id: string, when: number, host: string, type: AuditEvent['type'], detail: string): AuditEvent {
  return { id, at: when, host, type, source: 'terminal', outcome: 'allowed', detail }
}

const events: AuditEvent[] = [
  row('today', todayAt, 'web', 'command', secrets.map(([input]) => input).join('\n')),
  row('d3', within7, 'web', 'file', 'upload /etc/hosts'),
  row('d10', within30, 'db', 'connect', 'connected'),
  row('old', older, 'web', 'danger', `blocked ${leak}`),
  row('other', todayAt, 'db', 'command', 'df -h')
]

const copy: AuditExportCopy = {
  title: '审计记录',
  redactNote: '密钥与密码已替换为 ••••，无法关闭',
  time: '时间',
  host: '主机',
  type: '类型',
  body: '正文',
  source: '来源',
  result: '结果',
  typeLabel: (type) => ({ connect: '连接', command: '命令', file: '文件', danger: '危险操作' })[type] ?? type
}

function exported(list: AuditEvent[], format: 'csv' | 'markdown' = 'csv') {
  return renderAuditCompliance(list, format, copy)
}

const todayRows = selectAuditExport(events, { range: 'today', now })
assert.deepEqual(todayRows.map((e) => e.id).sort(), ['other', 'today'])
const week = selectAuditExport(events, { range: '7d', now })
assert.deepEqual(week.map((e) => e.id).sort(), ['d3', 'other', 'today'])
const month = selectAuditExport(events, { range: '30d', now })
assert.ok(month.some((e) => e.id === 'd10'))
assert.equal(month.some((e) => e.id === 'old'), false)
const custom = selectAuditExport(events, { range: 'custom', since: '2026-10-01', until: '2026-10-06', now })
assert.deepEqual(custom.map((e) => e.id), ['d10'])
const stacked = selectAuditExport(events, { range: '7d', host: 'web', type: 'command', now })
assert.deepEqual(stacked.map((e) => e.id), ['today'])
assert.equal(stacked.length, 1)
assert.equal(auditExportCanSave(0), false)
assert.equal(auditExportCanSave(stacked.length), true)

const bounds = auditWindowBounds({ range: 'today', now })
assert.equal(bounds.since, new Date(2026, 9, 15, 0, 0, 0, 0).getTime())
assert.equal(bounds.until, now)

for (const format of ['csv', 'markdown'] as const) {
  const text = exported(stacked, format)
  for (const [, secret] of secrets) assert.equal(text.includes(secret), false, `${format} ${secret}`)
  assert.equal(text.includes(leak), false, format)
  assert.ok(text.includes('••••'), format)
  assert.ok(text.includes('web'), format)
  assert.ok(text.includes('命令'), format)
  assert.ok(text.includes('terminal'), format)
  assert.ok(text.includes('allowed'), format)
  assert.ok(text.includes('时间') && text.includes('主机') && text.includes('正文') && text.includes('来源') && text.includes('结果'), format)
}
const md = exported(stacked, 'markdown')
assert.ok(md.startsWith('# 审计记录'))
assert.ok(md.includes('无法关闭'))
const csv = exported([row('comma', todayAt, 'web', 'command', 'disk, full')], 'csv')
assert.ok(csv.includes('"disk, full"'))
assert.equal(exported(selectAuditExport(events, { range: '30d', now }), 'csv').includes(leak), false)
assert.equal(auditExportFileName('csv', new Date(2026, 9, 15)).endsWith('.csv'), true)
assert.equal(auditExportFileName('markdown', new Date(2026, 9, 15)), 'audit-2026-10-15.md')

setAuditExportContext({ range: '30d', host: 'db', type: 'connect' })
assert.equal(peekAuditExportContext()?.host, 'db')
setAuditExportContext(null)
assert.equal(peekAuditExportContext(), null)

assert.equal(zh('s1b.open'), '导出…')
assert.equal(en('s1b.open'), 'Export…')
assert.equal(zh('s1b.title'), '导出审计记录')
assert.equal(en('s1b.title'), 'Export audit entries')
assert.equal(zh('s1b.range'), '时间范围')
assert.equal(en('s1b.range'), 'Time range')
assert.equal(zh('s1b.host'), '主机')
assert.equal(en('s1b.host'), 'Host')
assert.equal(zh('s1b.action'), '动作类型')
assert.equal(en('s1b.action'), 'Action type')
assert.equal(zh('s1b.csv'), 'CSV')
assert.equal(zh('s1b.md'), 'Markdown')
assert.equal(zh('s1b.exportN', { n: 3 }), '导出 3 条')
assert.equal(en('s1b.exportN', { n: 3 }), 'Export 3 entries')
assert.equal(zh('s1b.exported', { file: 'audit.md' }), '已导出到 audit.md')
assert.equal(en('s1b.exported', { file: 'audit.md' }), 'Exported to audit.md')
assert.equal(zh('s1b.openFolder'), '打开文件夹')
assert.equal(en('s1b.openFolder'), 'Open folder')
assert.ok(zh('s1b.redactNote').includes('••••') && zh('s1b.redactNote').includes('无法关闭'))
assert.ok(en('s1b.redactNote').includes('cannot be turned off'))
assert.equal(zh('s1b.empty'), '没有符合条件的记录')
assert.equal(en('s1b.empty'), 'No matching entries')
assert.equal(zh('s1b.open').endsWith('…'), en('s1b.open').endsWith('…'))

const ops = SHARED_MENUS.find((menu) => menu.id === 'ops')!
const visible = visibleActionIds(ops)
assert.deepEqual(visible, ['opsHome', 'alertWorkbench', 'playbooks', 'resourceMonitor', 'serverTools', 'batchExec', 'snippets', 'inventory'])
assert.ok(visible.length < 12)
assert.equal(visible.includes('exportAudit'), false)
assert.ok(ops.items.some((item) => item.type === 'item' && item.id === 'exportAudit' && item.menuHidden))
assert.equal(paletteCategory('exportAudit'), 'ops')

const zhEntry = buildPaletteEntries(SHARED_MENUS, 'zh-CN').find((entry) => entry.id === 'exportAudit')
const enEntry = buildPaletteEntries(SHARED_MENUS, 'en').find((entry) => entry.id === 'exportAudit')
assert.equal(zhEntry?.label, '导出审计（合规）')
assert.equal(zhEntry?.group, '运维')
assert.equal(enEntry?.label, 'Export audit (compliance)')
for (const query of ['审计导出', '合规导出', 'audit export', 'sjdc', 'hgdc', '导出审计', '审计 / 合规']) {
  assert.ok(paletteMatch(query, 'zh-CN').includes('exportAudit'), query)
}
const emptyHtml = renderToStaticMarkup(
  createElement(I18nProvider, null, createElement(AuditExportModal, { open: true, events: [], seed: { range: '7d' }, onClose() {} }))
)
assert.match(emptyHtml, /min\(92vw, 420px\)/)
assert.match(emptyHtml, /data-testid="s1b-save"[^>]*disabled/)
assert.match(emptyHtml, /没有符合条件的记录/)
assert.match(emptyHtml, /class="s1b-filters"/)
assert.match(emptyHtml, /近 7 天/)
assert.equal(emptyHtml.includes('checkbox'), false)
assert.equal(emptyHtml.includes('clipboard'), false)
const oneHtml = renderToStaticMarkup(
  createElement(
    I18nProvider,
    null,
    createElement(AuditExportModal, {
      open: true,
      events: [row('live', Date.now() - 60_000, 'web', 'command', 'df -h')],
      seed: { range: 'today' },
      onClose() {}
    })
  )
)
assert.match(oneHtml, /data-testid="s1b-save"(?![^>]*disabled)/)
assert.match(oneHtml, /导出 1 条/)
assert.match(oneHtml, />1 条</)
assert.ok(paletteMatch('audit export', 'en').includes('exportAudit'))

const modal = readFileSync('src/renderer/src/components/AuditExportModal.tsx', 'utf8')
const panel = readFileSync('src/renderer/src/components/AuditLogPanel.tsx', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
const exportSrc = readFileSync('src/shared/audit-export.ts', 'utf8')
assert.ok(panel.includes('data-testid="s1b-open"'))
assert.ok(panel.includes("t('s1b.open')"))
assert.equal(panel.includes('auditToJsonl'), false)
assert.equal(panel.includes('navigator.clipboard'), false)
assert.ok(modal.includes('width={420}'))
assert.ok(modal.includes('auditExportCanSave'))
assert.ok(modal.includes('saveText'))
assert.ok(modal.includes('.reveal'))
assert.equal(modal.includes('clipboard'), false)
assert.equal(modal.includes('mailto:'), false)
assert.equal(modal.includes('window.confirm'), false)
assert.equal(/fetch\s*\(/.test(modal), false)
assert.equal(exportSrc.includes('skipRedact'), false)
assert.equal(modal.includes('type="checkbox"'), false)
assert.ok(app.includes("action === 'exportAudit'"))
assert.ok(app.includes('<AuditExportModal'))
assert.equal(toolbar.includes('exportAudit'), false)
assert.equal(toolbar.includes('s1b.'), false)
assert.match(css, /\.s1b-range[^{]*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(css, /\.s1b-filters[^{]*\{[^}]*flex-wrap:\s*nowrap/)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.ok(unreleased.includes('S1b'))
assert.ok(unreleased.includes('Public HOLD'))
assert.ok(unreleased.includes('0.4.4'))
const order = ['Polish-3', 'A-TFL', 'L9', 'A-OM', 'L10', 'A6', 'W9']
let cursor = -1
for (const mark of order) {
  const next = unreleased.indexOf(mark)
  assert.ok(next > cursor, mark)
  cursor = next
}

console.log('test-s1b ok')
