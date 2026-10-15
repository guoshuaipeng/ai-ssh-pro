/** v0.4.1: jump/certs, 1366 density, settings, palette, sidebar, session restore. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ssh2 from 'ssh2'
import { allowsPageScrollX, l2Actions, l2Filter, l2Mode, l7Mode } from '../src/shared/density'
import { HOST_MENU_MULTI, HOST_MENU_SINGLE, menuSourceFollows } from '../src/shared/host-menu'
import { chainDiagram, MAX_HOPS } from '../src/shared/jump-chain'
import { L7_RAIL, railCollapsed, railOverflow } from '../src/shared/l7-rail'
import { layoutPalette, bumpUsage, pinnedIds, PALETTE_CATS } from '../src/shared/palette-rank'
import { dedupeRecent, loadRecentExpanded } from '../src/shared/recent-sidebar'
import { CHANGELOG_RESTORE_SCOPE, planRestore, snapshotWorkspace } from '../src/shared/session-restore'
import { sectionForAction } from '../src/shared/settings-nav'
import { certCardState, detectKeyMaterial, skNeedsAgent } from '../src/shared/ssh-cert'
import { parseHopFailure, probeHostKeyError } from '../src/shared/jump-chain'
import { placeMenu } from '../src/shared/menu-place'
import { buildPaletteEntries } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'
import { tabLabel } from '../src/shared/tab-label'
import { TAB_STRIP_NUDGE, tabStripOverflow, tabStripWheelDelta } from '../src/shared/tab-overflow'
import { detectKeyFileKind } from '../src/main/key-kind'
import { changelogFor } from '../src/shared/changelog'
import { applyConnectAuth, SshAuthError } from '../src/main/ssh-auth'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const css = readFileSync('src/renderer/src/features.css', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const home = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
const changelog = readFileSync('CHANGELOG.md', 'utf8')

assert.equal(l7Mode(1366), 'three')
assert.equal(l7Mode(1200), 'three')
assert.equal(l7Mode(1199), 'stacked')
assert.equal(l2Mode(1100), 'split')
assert.equal(l2Mode(1099), 'stacked')
assert.equal(l2Actions(901), 'text')
assert.equal(l2Actions(900), 'icons')
assert.equal(l2Filter(1041), 'single')
assert.equal(l2Filter(1040), 'search-row')
assert.equal(allowsPageScrollX(), false)
assert.ok(css.includes('@container (max-width: 1199px)') && css.includes('@container (max-width: 1099px)'))
assert.ok(css.includes('@container (max-width: 1040px)') && css.includes('.l2-ico'))
assert.ok(css.includes('container-type: inline-size'))

const strip = tabStripOverflow({ containerWidth: 200, tabWidths: [80, 80, 80, 80], reserved: 28 })
assert.equal(strip.wraps, false)
assert.equal(strip.overflow, true)
assert.ok(strip.visibleCount < 4)
assert.equal(strip.hidden, 4 - strip.visibleCount)
const fit = tabStripOverflow({ containerWidth: 400, tabWidths: [112, 112, 112] })
assert.equal(fit.wraps, false)
assert.equal(fit.overflow, false)
assert.equal(fit.hidden, 0)
assert.equal(fit.visibleCount, 3)
const scrollRule = styles.slice(styles.indexOf('.tab-bar-scroll {'), styles.indexOf('.tab-bar-scroll::-webkit-scrollbar'))
assert.ok(scrollRule.includes('scrollbar-width: none'))
assert.match(styles, /\.tab-bar-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
assert.ok(styles.includes('height: 36px') && styles.includes('height: 30px'))
assert.ok(styles.includes('min-width: 112px') && styles.includes('min-width: 96px'))
assert.ok(styles.includes('border-top: 2px solid transparent'))
assert.ok(styles.includes('mask-image:'))
assert.ok(css.includes('border-top-color: #ef4444') && css.includes('border-top-color: #f97316'))
assert.ok(!css.includes('border-top: 2px solid #ef4444') && !css.includes('border-top: 2px solid #f97316'))
assert.ok(styles.includes('flex-wrap: nowrap') && styles.includes('.tab-overflow-menu'))
assert.ok(app.includes('data-testid="tab-bar-scroll"') && app.includes('data-testid="tab-overflow"'))
assert.ok(app.includes('data-testid="tab-scroll-left"') && app.includes('data-testid="tab-scroll-right"'))
assert.ok(app.includes('←') && app.includes('→') && app.includes('TAB_STRIP_NUDGE'))
assert.equal(tabStripWheelDelta(0, 120), 120)
assert.equal(tabStripWheelDelta(0, -40), -40)
assert.equal(tabStripWheelDelta(80, 10), 80)
assert.equal(TAB_STRIP_NUDGE, 160)
assert.ok(app.includes('scrollLeft += delta') && app.includes('capture: true, passive: false'))
assert.ok(app.includes("e.key !== 'Escape'") && app.includes("addEventListener('mousedown', onPointer)"))
const overflowBtn = app.slice(app.indexOf('data-testid="tab-overflow"'), app.indexOf('data-testid="tab-overflow-menu"'))
assert.ok(overflowBtn.includes('⌄') && !overflowBtn.includes('⋯'))
const overflowMenu = app.slice(app.indexOf('data-testid="tab-overflow-menu"'), app.indexOf('data-testid="broadcast-bar"'))
assert.ok(overflowMenu.includes('labelFor(t)') && overflowMenu.includes('aria-current'))
assert.ok(overflowMenu.includes('✓') && !overflowMenu.includes('{t.title}'))
assert.ok(app.includes('className="tab-title">{labelFor(t)}'))
const trStub = (key: string, vars?: Record<string, string | number>) => {
  const map: Record<string, string> = {
    'tab.connecting': '{title} (连接中…)',
    'tab.disconnected': '{title} (已断开)',
    'l7.title': '运维首页',
    'l2.title': '告警工作台',
    'l4.auditTitle': '审计日志',
    'settings.title': '设置'
  }
  return (map[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ''))
}
assert.equal(tabLabel({ title: 'Ops home', view: 'home' }, trStub), '运维首页')
assert.equal(tabLabel({ title: 'Alerts', view: 'alert-workbench' }, trStub), '告警工作台')
assert.equal(tabLabel({ title: 'web-01', view: 'session', status: 'disconnected' }, trStub), 'web-01 (已断开)')
assert.equal(tabLabel({ title: 'audit', view: 'audit', auditHost: 'db' }, trStub), '审计日志 · db')
assert.equal(tabLabel({ title: 'web-02', view: 'session', status: 'connected' }, trStub), 'web-02')
const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'tab.overflow': '所有标签（{n}）· {hidden} 个未显示'"))
assert.ok(i18n.includes("'tab.overflow': 'All tabs ({n}) · {hidden} hidden'"))
assert.ok(i18n.includes("'tab.list.title': '所有标签（{n}）'") && i18n.includes("'tab.list.title': 'All tabs ({n})'"))

assert.deepEqual(railOverflow(200).visible, [...L7_RAIL])
assert.ok(railOverflow(120).more.includes('syncFolder'))
assert.equal(railCollapsed(1199), true)
assert.equal(railCollapsed(1200), false)
assert.ok(home.includes('data-testid="l7-open-sftp"') && home.includes('data-testid="l7-sync-folder"'))
assert.ok(app.includes("handleTitlebarMenuAction('sftp')") && app.includes("handleTitlebarMenuAction('folderSync')"))

assert.equal(sectionForAction('settings'), 'general')
assert.equal(sectionForAction('startupSettings'), 'general')
assert.equal(sectionForAction('uiTheme'), 'appearance')
assert.equal(sectionForAction('terminalPrefs'), 'terminal')
assert.equal(sectionForAction('ai'), 'ai')
assert.equal(sectionForAction('mcpGuide'), 'ai')
assert.equal(sectionForAction('shortcuts'), 'shortcuts')
assert.equal(sectionForAction('about'), 'about')
assert.equal(sectionForAction('backup'), 'backup')
assert.equal(sectionForAction('sftp'), null)
assert.ok(app.includes("view: 'settings'") && app.includes('<SettingsPanel'))
assert.ok(readFileSync('src/renderer/src/components/SettingsPanel.tsx', 'utf8').includes('data-testid="settings-panel"'))

const syncRows = [
  { id: 'folderSync', label: '同步文件夹…', hay: '同步文件夹 folder sync', order: 4, category: 'file' as const },
  { id: 'syncPreview', label: '同步预览', hay: '同步预览 sync preview', order: 9, category: 'file' as const },
  { id: 'cloudSync', label: '云同步…', hay: '云同步 cloud sync', order: 1, category: 'file' as const },
  { id: 'syncNow', label: '立即同步', hay: '立即同步 sync now', order: 2, category: 'file' as const },
  { id: 'syncConflicts', label: '同步冲突', hay: '同步冲突 sync conflict', order: 3, category: 'file' as const },
  { id: 'settings', label: '设置', hay: 'settings 设置', order: 1, category: 'settings' as const }
]
assert.deepEqual(
  layoutPalette(syncRows, 'sync').items.map((row) => row.id),
  ['cloudSync', 'syncNow', 'syncConflicts', 'folderSync', 'syncPreview']
)
const usage = bumpUsage(bumpUsage({}, 'settings'), 'settings')
assert.deepEqual(pinnedIds(usage), ['settings'])
const grouped = layoutPalette(syncRows, '', usage)
assert.equal(grouped.rows[0]?.kind, 'header')
assert.equal(grouped.rows[0]?.kind === 'header' ? grouped.rows[0].id : '', 'pinned')
const headers = grouped.rows.filter((row) => row.kind === 'header').map((row) => (row.kind === 'header' ? row.id : ''))
assert.deepEqual(headers.filter((id) => id !== 'pinned'), PALETTE_CATS.filter((cat) => cat === 'file' || cat === 'settings'))
assert.ok(readFileSync('src/renderer/src/lib/palette.ts', 'utf8').includes('为当前连接设置跳板机…'))

assert.equal(loadRecentExpanded({ getItem: () => null }), false)
assert.equal(loadRecentExpanded({ getItem: () => '1' }), true)
const recent = dedupeRecent([
  { id: 'a', host: 'h', port: 22, username: 'root', lastConnectedAt: 3 },
  { id: 'b', host: 'h', port: 22, username: 'root', lastConnectedAt: 2 },
  { id: 'c', host: 'h', port: 22, username: 'bob', pinned: true, lastConnectedAt: 1 }
])
assert.equal(recent.length, 2)
assert.equal(recent[0]?.id, 'c')
assert.ok(app.includes('savedKeys={profiles.map'))

const single = app.slice(app.indexOf('data-testid="host-menu"'))
const singleKeys = ['connect', 'connectNew', 'sftp', 'monitor', 'toolbox', 'edit', 'profile', 'rename', 'copyAddr', 'delete']
const itemOrder = (source: string, keys: string[]) => {
  let at = 0
  for (const key of keys) {
    const token = `item('${key}'`
    const i = source.indexOf(token, at)
    if (i < 0) return false
    at = i + token.length
  }
  return true
}
assert.equal(itemOrder(single, singleKeys), true)
assert.equal(menuSourceFollows(app, ['move', 'setLevel']), true)
assert.ok(single.indexOf('moveTo([p.id]') > single.indexOf("item('rename'"))
assert.ok(single.indexOf('moveTo([p.id]') < single.indexOf("item('copyAddr'"))
assert.ok(!single.includes('data-ctx="docker"') && !single.includes('data-ctx="tags"'))
assert.deepEqual([...HOST_MENU_SINGLE], ['connect', 'connectNew', 'sftp', 'monitor', 'toolbox', 'edit', 'profile', 'rename', 'move', 'copyAddr', 'delete'])
const multi = app.slice(app.indexOf('data-testid="host-menu-multi"'), app.indexOf('data-testid="host-menu"'))
assert.equal(itemOrder(multi, ['batch', 'monitorBoard', 'delete']), true)
assert.equal(menuSourceFollows(multi, ['setLevel']), true)
assert.ok(multi.indexOf('data-ctx="setLevel"') < multi.indexOf('moveTo(multi)'))
assert.ok(multi.indexOf('moveTo(multi)') < multi.indexOf("item('delete'"))
assert.deepEqual([...HOST_MENU_MULTI], ['batch', 'monitorBoard', 'setLevel', 'move', 'delete'])
assert.ok(app.includes("opts?.danger ? ' danger' : ''"))
assert.ok(single.slice(single.indexOf("item('delete'")).includes('danger: true'))

const restored = planRestore(
  [
    { kind: 'batch', title: 'batch', order: 0 },
    { kind: 'home', title: 'home', order: 2, active: true },
    { kind: 'terminal', title: 'gone', order: 1, profileId: 'missing' },
    { kind: 'sftp', title: 'files', order: 3, profileId: 'p1' },
    { kind: 'settings', title: 'Settings', order: 4, settingsSection: 'ai' }
  ],
  new Set(['p1'])
)
assert.equal(restored.skipped, 2)
assert.deepEqual(restored.keep.map((row) => row.kind), ['home', 'sftp', 'settings'])
const shot = snapshotWorkspace(
  [
    { tabId: 't1', title: 'shell', profileId: 'p1', kind: 'ssh' },
    { tabId: 't2', view: 'home', title: 'home' },
    { tabId: 't3', view: 'batch', title: 'batch' },
    { tabId: 't4', kind: 'local', title: 'local' }
  ],
  't2'
)
assert.deepEqual(shot.map((row) => row.kind), ['terminal', 'home'])
assert.equal(shot[1]?.active, true)
assert.ok(!JSON.stringify(shot).includes('scrollback'))
assert.ok(changelog.includes(CHANGELOG_RESTORE_SCOPE.zh) && changelog.includes(CHANGELOG_RESTORE_SCOPE.en))
assert.ok(changelog.includes('## v0.4.1\n') && changelog.includes('## v0.4.0\n'))
assert.ok(changelog.includes('修复冷启动首次双击窗口不显示'))
assert.ok(changelog.includes('Fix main window not showing on first cold-start launch'))

const wrapped = "Error invoking remote method 'ssh:connect': Error: [hop 1/1] x (h:22): connect ECONNREFUSED h:22"
const parsedHop = parseHopFailure(wrapped)
assert.ok(parsedHop)
assert.equal(parsedHop.hop, 1)
assert.equal(parsedHop.total, 1)
assert.equal(parsedHop.name, 'x')
assert.equal(parsedHop.addr, 'h:22')
assert.match(parsedHop.reason, /ECONNREFUSED/)
assert.ok(app.includes('stripIpcPrefix(raw)') && app.includes("tg('m2.hopReason'"))
assert.equal(probeHostKeyError('trusted'), null)
assert.ok(probeHostKeyError('unknown')?.zh.includes('主机密钥未信任'))
assert.ok(probeHostKeyError('changed')?.en.includes('untrusted or changed'))
const probeSrc = readFileSync('src/main/jump-probe.ts', 'utf8')
assert.ok(!probeSrc.includes('hostVerifier: () => true'))
assert.ok(probeSrc.includes('checkHostKey') && probeSrc.includes('verify(false)'))
assert.ok(app.includes('createPortal(') && app.includes("document.body"))
assert.ok(app.includes("e.key === 'ArrowRight'") && app.includes('tabStripWheelDelta'))
const menuBlock = app.slice(app.indexOf('createPortal('), app.indexOf('broadcast-bar'))
assert.ok(menuBlock.includes('labelFor(t)') && menuBlock.includes('aria-current') && !menuBlock.includes('{t.title}'))
const placed = placeMenu(10, 398, 220, 400, 1366, 768)
assert.ok(placed.y + 400 <= 768 - 8)
assert.equal(placed.x, 10)
const paletteRows = buildPaletteEntries(SHARED_MENUS, 'zh-CN')
assert.equal(paletteRows.filter((row) => row.id === 'opsHome').length, 1)
assert.equal(paletteRows.find((row) => row.id === 'folderSync')?.label, '同步文件夹…')
assert.ok(readFileSync('src/renderer/src/components/CommandPalette.tsx', 'utf8').includes('CAT_KEY[e.category]'))
const settingsCopies = [...i18n.matchAll(/'settings\.title': '([^']*)'/g)].map((m) => m[1])
assert.deepEqual(settingsCopies, ['设置', 'Settings'])
const trCatalog = (copy: string) => (key: string) => (key === 'settings.title' ? copy : key)
assert.equal(tabLabel({ title: 'Settings', view: 'settings' }, trCatalog('设置')), '设置')
assert.equal(tabLabel({ title: 'Settings', view: 'settings' }, trCatalog('Settings')), 'Settings')
assert.notEqual(tabLabel({ title: 'menu.settings', view: 'settings' }, trCatalog('设置')), 'menu.settings')
assert.equal(tabLabel({ title: 'Settings', view: 'settings' }, trStub), '设置')
const snap = snapshotWorkspace(
  [{ tabId: 's', view: 'settings', title: 'Settings' }, { tabId: 't', title: 'web-01', profileId: 'p' }],
  's'
)
assert.equal(snap.find((row) => row.kind === 'settings')?.title, '')
assert.equal(snap.find((row) => row.kind === 'terminal')?.title, 'web-01')
assert.ok(app.includes('n: hopProgress.total'))
assert.ok(!readFileSync('src/renderer/src/components/CertCard.tsx', 'utf8').includes('64_000'))
assert.ok(readFileSync('src/renderer/src/components/CertCard.tsx', 'utf8').includes('detectKeyKind'))
const keyFile = join(mkdtempSync(join(tmpdir(), 'aiss-key-')), 'id_ed25519')
writeFileSync(keyFile, '-----BEGIN OPENSSH PRIVATE KEY-----\nssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAItest\n')
assert.equal(detectKeyFileKind(keyFile), 'ed25519')
assert.equal(detectKeyFileKind(keyFile + '.missing'), 'unknown')
rmSync(keyFile, { force: true })
assert.ok(changelogFor('0.4.1').length >= 4)
assert.ok(app.includes('snapshotWorkspace') && app.includes('planRestore'))

const chips = chainDiagram([{ id: 'h1', host: 'bastion', port: 22, username: 'jump' }], 'target.example')
assert.equal(MAX_HOPS, 5)
assert.deepEqual(chips.map((chip) => chip.role), ['local', 'hop', 'target'])
assert.equal(detectKeyMaterial('sk-ssh-ed25519@openssh.com AAAA'), 'sk-ed25519')
assert.equal(skNeedsAgent('sk-ed25519', 'key'), true)
assert.equal(skNeedsAgent('sk-ed25519', 'agent'), false)
assert.equal(certCardState({ found: false, principals: [], tone: 'unknown' }).code, 'none')
assert.ok(app.includes('data-testid="jump-fail-edit"') && app.includes('data-testid="jump-fail-certs"') && app.includes('m2.groupJumpConfirm'))
assert.ok(!app.includes('window.confirm'))

const dir = mkdtempSync(join(tmpdir(), 'aiss-cert-'))
try {
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-f', join(dir, 'ca'), '-N', ''])
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-f', join(dir, 'user'), '-N', ''])
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-f', join(dir, 'host'), '-N', ''])
  execFileSync('ssh-keygen', ['-q', '-s', join(dir, 'ca'), '-I', 'aiss-v041', '-n', 'alice', '-V', '+1d', join(dir, 'user.pub')])
  const certText = readFileSync(join(dir, 'user-cert.pub'), 'utf8')
  assert.ok(certText.includes('ssh-ed25519-cert-v01@openssh.com'))

  const cfg: ssh2.ConnectConfig = { host: '127.0.0.1', port: 1, username: 'alice' }
  await applyConnectAuth(
    cfg,
    { authMode: 'key', privateKeyPath: join(dir, 'user'), certificatePath: join(dir, 'user-cert.pub') },
    { allowDefaultKey: false }
  )
  assert.equal(typeof cfg.authHandler, 'function')

  let offered = ''
  let signatureOk = false
  const userKey = ssh2.utils.parseKey(readFileSync(join(dir, 'user')))
  if (userKey instanceof Error || Array.isArray(userKey)) throw userKey
  const server = new ssh2.Server({ hostKeys: [readFileSync(join(dir, 'host'))] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'publickey') {
        offered = ctx.key?.algo || ''
        if (!offered.includes('cert')) {
          ctx.reject(['publickey'])
          return
        }
        if (!ctx.signature || !ctx.blob) {
          ctx.accept()
          return
        }
        const ok = userKey.verify(ctx.blob, ctx.signature)
        signatureOk = ok === true
        if (ok !== true) ctx.reject(['publickey'])
        else ctx.accept()
        return
      }
      ctx.reject(['publickey'])
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('exec', (acceptExec) => {
          const stream = acceptExec()
          stream.exit(0)
          stream.end()
        })
      })
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  const client = new ssh2.Client()
  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => resolve())
    client.once('error', reject)
    client.connect({
      ...cfg,
      host: '127.0.0.1',
      port: address.port,
      username: 'alice',
      readyTimeout: 8000,
      hostVerifier: () => true
    })
  })
  assert.ok(offered.includes('cert'), `server saw certificate algo, got ${offered}`)
  assert.equal(signatureOk, true, 'certificate signature verifies with the user key')
  client.end()
  server.close()

  const { writeFileSync } = await import('node:fs')
  const skFile = join(dir, 'sk-forced')
  writeFileSync(skFile, '-----BEGIN OPENSSH PRIVATE KEY-----\nsk-ssh-ed25519@openssh.com\n-----END OPENSSH PRIVATE KEY-----\n')
  await assert.rejects(
    () => applyConnectAuth({ host: 'h', username: 'a' }, { authMode: 'key', privateKeyPath: skFile }, { allowDefaultKey: false }),
    (error: unknown) => error instanceof SshAuthError && error.code === 'SK_NEEDS_AGENT'
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('v041 ok')
