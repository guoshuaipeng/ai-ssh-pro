/** v0.4.2: alert draft, dry-run, snapshots, postmortem, and the UX polish that ships with them. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { changelogFor } from '../src/shared/changelog'
import { ICON_NAMES, ICON_PATHS } from '../src/shared/icon-registry'
import { matchKeymap, KEYMAP } from '../src/shared/keymap'
import { SHARED_MENUS, visibleActionIds } from '../src/shared/menus'
import { hostSelectable } from '../src/shared/playbook'
import { discoverVars, findAlertDraft, isStaleDraft, playbookFromFixes, rewritePlaceholders } from '../src/shared/playbook-draft'
import { dryRunPlaybook, expandStepCommand } from '../src/shared/playbook-dry'
import { buildPaletteEntries } from '../src/renderer/src/lib/palette'
import { eligibleSnapshot, normalizeSnapshotKeep, recordRollbackAudit, recordSnapshot, rollbackAllowed, rollbackAuditDetail, rollbackNeedsHostName, shouldRecordSnapshot, snapshotStats, trimSnapshots, type Snapshot } from '../src/shared/snapshots'
import { migrateSyncRecord, readSyncPassphrase } from '../src/shared/sync-passphrase'
import { blockStripPx, clampBlockRatio } from '../src/shared/terminal-blocks'
import { expandTemplate, shellQuote } from '../src/shared/template-vars'
import { appendTimeline, eventsFor, renderPostmortem, DEFAULT_POSTMORTEM, type TimelineAlert, type TimelineEvent } from '../src/shared/timeline'
import { loadAudit } from '../src/shared/audit-log'

const read = (p: string) => readFileSync(p, 'utf8')
const app = read('src/renderer/src/App.tsx')
const snippets = read('src/renderer/src/components/SnippetsPanel.tsx')
const blocks = read('src/renderer/src/components/TerminalBlocks.tsx')
const editor = read('src/renderer/src/components/RemoteTextEditor.tsx')
const runner = read('src/renderer/src/lib/folder-sync-run.ts')
const pkg = JSON.parse(read('package.json')) as { version: string }
const changelog = read('CHANGELOG.md')

assert.equal(pkg.version, '0.4.2')
assert.ok(changelogFor('0.4.2').length >= 4)
assert.ok(changelogFor('0.4.1').length >= 4)
assert.ok(changelog.includes('## v0.4.2\n') && changelog.includes('## v0.4.1\n') && changelog.includes('## v0.4.0\n'))

const origin = { kind: 'alert' as const, alertId: 'a1', hostKey: 's1', hostTitle: 'web01', ruleId: 'cpu', at: 1 }
const built = playbookFromFixes(
  [
    { command: 'ps aux | head', note: 'top' },
    { command: 'ps aux | head', note: 'dup' },
    { command: 'kill <pid>', note: 'stop' },
    { command: 'echo YOUR_name' },
    ...Array.from({ length: 12 }, (_, i) => ({ command: `echo step-${i}` }))
  ],
  origin,
  'normal',
  { profileId: 'p1', locale: 'zh', now: 10 }
)
assert.equal(built.playbook.draft, true)
assert.equal(built.playbook.steps.length, 10)
assert.ok(built.truncated > 0)
assert.equal(built.playbook.steps.filter((s) => s.command === 'ps aux | head').length, 1)
assert.ok(built.playbook.steps.every((s) => s.confirm && s.aiGenerated))
assert.equal(built.playbook.steps[1]!.command, 'kill {{pid}}')
assert.equal(built.playbook.targetHint?.[0], 'p1')
assert.equal(findAlertDraft([built.playbook], 'a1')?.id, built.playbook.id)
assert.equal(rewritePlaceholders('svc <service>').check, false)
assert.equal(rewritePlaceholders('see <not a var>').check, true)
const prod = playbookFromFixes([{ command: 'echo ok' }], origin, 'production', { now: 11 })
assert.equal(prod.playbook.steps[0]!.lockedConfirm, true)
assert.equal(dryRunPlaybook.length, 1)
assert.equal('exec' in dryRunPlaybook, false)

const step = built.playbook.steps.find((s) => s.command.includes('{{pid}}'))!
const host = { id: 'h1', name: 'web01', user: 'root', host: '10.0.0.8', level: 'normal' as const, sessionId: 'live' }
const expanded = expandStepCommand(step, host, [], { pid: "a b'c" }, built.playbook)
assert.equal(expanded.text.includes(shellQuote("a b'c")), true)
assert.equal(expanded.missing.length, 0)
const secret = expandTemplate('echo {{token}}', { token: 's3cret' }, [{ name: 'token', sensitive: true, quote: true }])
assert.ok(secret.text.includes('s3cret'))
assert.ok(secret.display.includes('••••'))
assert.ok(!secret.display.includes('s3cret'))

const ro = dryRunPlaybook({
  playbook: built.playbook,
  hosts: [{ ...host, id: 'ro', level: 'readonly', sessionId: 'live' }],
  values: { pid: '1', name: 'n' }
})
assert.equal(ro.nothingSent, true)
assert.equal(ro.rows.length, 1)
assert.equal(ro.rows[0]!.verdict, 'blocked')
assert.equal(hostSelectable({ id: 'ro', name: 'ro', user: 'u', host: 'h', level: 'readonly' }), false)
const offline = dryRunPlaybook({ playbook: built.playbook, hosts: [{ ...host, sessionId: undefined }], values: { pid: '1', name: 'n' }, online: () => false })
assert.equal(offline.rows[0]!.verdict, 'offline')
const dangerBook = playbookFromFixes([{ command: 'sudo reboot' }], origin, 'normal', { now: 12 }).playbook
const danger = dryRunPlaybook({ playbook: dangerBook, hosts: [{ ...host, level: 'production' }], values: {} })
assert.equal(danger.rows[0]!.verdict, 'danger')
assert.equal(danger.rows[0]!.requireHostName, true)
assert.equal(isStaleDraft({ ...built.playbook, updatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }), true)
const vars = discoverVars(built.playbook)
assert.ok(vars.some((v) => v.name === 'pid'))

const seal = (s: string) => `enc:${s}`
const snap = recordSnapshot([], { profileId: 'p', path: '/etc/nginx.conf', content: 'a\n', source: 'edit', encrypt: seal, at: 1 })
assert.equal(snap.added, true)
assert.notEqual(snap.list[0]!.ciphertext, 'a\n')
const dup = recordSnapshot(snap.list, { profileId: 'p', path: '/etc/nginx.conf', content: 'a\n', source: 'edit', encrypt: seal, at: 2 })
assert.equal(dup.added, false)
assert.equal(dup.skipped, 'duplicate')
const pinned: Snapshot = { ...snap.list[0]!, id: 'pin', pinned: true, at: 1, hash: 'old', ciphertext: 'enc:old', bytes: 10 }
const many: Snapshot[] = [pinned]
for (let i = 0; i < 12; i++) {
  many.push({ ...pinned, id: `u${i}`, pinned: false, at: 10 + i, hash: `h${i}`, bytes: 10 })
}
const trimmed = trimSnapshots(many, 10)
assert.ok(trimmed.some((s) => s.id === 'pin'))
assert.ok(trimmed.filter((s) => !s.pinned).length <= 9)
assert.equal(eligibleSnapshot('a\0b').ok, false)
assert.equal(rollbackAllowed('readonly'), false)
assert.equal(rollbackAllowed('production'), true)
assert.equal(rollbackNeedsHostName('production'), true)
assert.equal(snapshotStats(snap.list).count, 1)

const mem = () => {
  const bag = new Map<string, string>()
  return { getItem: (k: string) => bag.get(k) ?? null, setItem: (k: string, v: string) => void bag.set(k, v) }
}
const store = mem()
assert.equal(normalizeSnapshotKeep(20), 20)
assert.equal(normalizeSnapshotKeep(7), 10)
assert.equal(shouldRecordSnapshot('edit', false), false)
assert.equal(shouldRecordSnapshot('rollback', false), true)
const rolledAt = Date.UTC(2026, 9, 15, 2, 4)
const rolledNow = rolledAt + 60_000
const auditStore = mem()
recordRollbackAudit(
  { path: '/etc/nginx.conf', at: rolledAt, host: 'web01', profileId: 'p1', hostKey: 'p1', outcome: 'allowed', now: rolledNow },
  auditStore
)
const fileAudit = loadAudit(auditStore)
assert.equal(fileAudit.length, 1)
assert.equal(fileAudit[0]!.type, 'file')
assert.equal(fileAudit[0]!.source, 'user')
assert.equal(fileAudit[0]!.outcome, 'allowed')
assert.equal(fileAudit[0]!.detail, rollbackAuditDetail('/etc/nginx.conf', rolledAt, rolledNow))
assert.match(fileAudit[0]!.detail, /^rollback \/etc\/nginx\.conf to /)
assert.equal(eventsFor('p1', auditStore).some((e) => e.kind === 'file.rollback'), true)
const blockedStore = mem()
recordRollbackAudit(
  { path: '/etc/nginx.conf', at: rolledAt, host: 'web01', profileId: 'p1', hostKey: 'p1', outcome: 'cancelled', now: rolledNow },
  blockedStore
)
assert.equal(loadAudit(blockedStore)[0]!.type, 'file')
assert.equal(loadAudit(blockedStore)[0]!.source, 'sftp')
assert.equal(loadAudit(blockedStore)[0]!.outcome, 'cancelled')
const alert: TimelineAlert = { id: 'al', hostKey: 'hk', hostTitle: 'web01', ruleId: 'cpu', value: 96, threshold: 90, at: 1_000, status: 'active', user: 'root' }
const secrets = ['password=hunter2', '--password s3cret', "-p'hide'", '-p"hide"', 'Bearer abc.def', 'AKIA1234567890123456']
const ev = appendTimeline({ alertId: 'al', at: 2_000, kind: 'note', hostKey: 'hk', summary: secrets.join(' ') }, store, 2_000)
for (const secret of ['hunter2', 's3cret', 'Bearer abc', 'AKIA1234567890123456']) assert.ok(!ev.summary.includes(secret), secret)
assert.ok(eventsFor('al', store).length >= 1)
const withOutput: TimelineEvent = { ...ev, id: 'out', kind: 'command.run', summary: 'ran', output: 'SECRET_OUTPUT', diff: 'SECRET_DIFF' }
const md = renderPostmortem(alert, [withOutput], { ...DEFAULT_POSTMORTEM, version: '0.4.2' })
assert.ok(!md.markdown.includes('web01'))
assert.ok(!md.markdown.includes('SECRET_OUTPUT'))
assert.ok(!md.markdown.includes('SECRET_DIFF'))
assert.ok(md.markdown.includes('host-'))
assert.ok(!md.markdown.includes('host-A →') && !JSON.stringify(md.markdown).includes('"host-'))
assert.equal(Object.keys(md.aliasMap).length > 0, true)
assert.ok(!md.markdown.includes(JSON.stringify(md.aliasMap)))
const shown = renderPostmortem(alert, [withOutput], { ...DEFAULT_POSTMORTEM, commandOutput: true, aliasHosts: false, version: '0.4.2' })
assert.ok(shown.markdown.includes('SECRET_OUTPUT') || shown.markdown.includes('••••'))
assert.equal(loadAudit(store).length, 0)

const ops = SHARED_MENUS.find((m) => m.id === 'ops')!
const visible = visibleActionIds(ops)
assert.ok(visible.length <= 12)
assert.deepEqual(visible, ['opsHome', 'alertWorkbench', 'playbooks', 'runPlaybook', 'resourceMonitor', 'dashboard', 'serverTools', 'batchExec', 'snippets', 'inventory', 'alertRules', 'auditLog'])
assert.ok(ops.items.some((it) => it.type === 'item' && it.id === 'refreshDocker' && it.menuHidden))
assert.ok(ops.items.some((it) => it.type === 'item' && it.id === 'alertHistory' && it.menuHidden))
const palette = buildPaletteEntries(SHARED_MENUS, 'zh-CN').map((e) => e.id)
assert.ok(palette.includes('refreshDocker') && palette.includes('alertHistory') && palette.includes('fixPlaybook'))
assert.equal(ops.items.find((it) => it.type === 'item' && it.id === 'aiExplainError'), undefined)
const ai = SHARED_MENUS.find((m) => m.id === 'ai')!
const explain = ai.items.find((it) => it.type === 'item' && it.id === 'aiExplainError')
assert.ok(explain && explain.type === 'item' && !explain.label.zh.startsWith('AI'))
assert.deepEqual(migrateSyncRecord({ vaultPass: 'legacy', webdavUrl: 'https://x' }), { webdavUrl: 'https://x', syncPassphrase: 'legacy' })
assert.equal(readSyncPassphrase({ vaultPass: 'legacy' }).stored, 'legacy')
assert.equal(readSyncPassphrase({ syncPassphrase: 'next', vaultPass: 'legacy' }).stored, 'next')

assert.equal(clampBlockRatio(0.1), 0.15)
assert.equal(clampBlockRatio(0.9), 0.5)
assert.equal(blockStripPx(600, 0.25).px >= 72, true)
assert.equal(blockStripPx(200, 0.15).collapsed, true)
assert.ok(blocks.includes('blocks.length===0') || blocks.includes('blocks.length === 0'))
assert.ok(blocks.includes('upsertCommandSnippet'))
assert.ok(!snippets.includes('snip.close'))
assert.ok(snippets.includes('snip-new') && snippets.includes('exportEmpty'))
assert.ok(!app.includes("tr('tab.none')") && !app.includes('tab.none'))
assert.ok(app.includes('demoProfileLabel'))
assert.ok(editor.includes('w3.bakHint'))
assert.ok(runner.indexOf('await beforeRemoteWrite()') < runner.indexOf('sftp.transfer'))
assert.ok(runner.indexOf('await beforeRemoteWrite()') < runner.indexOf('sftp.remove'))
assert.ok(runner.includes('captureRemoteSnapshot'))
assert.ok(ICON_NAMES.length >= 30 && ICON_NAMES.length <= 40)
assert.ok(ICON_NAMES.every((n) => ICON_PATHS[n]?.includes('M')))
assert.equal(KEYMAP.some((k) => k.id === 'fixPlaybook' && k.scope === 'alertWorkbench'), true)
assert.equal(matchKeymap({ key: 'Enter', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, false), undefined)
assert.equal(matchKeymap({ key: 'Enter', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, false, ['alertWorkbench']), 'fixPlaybook')

const history = read('src/renderer/src/components/FileHistoryTab.tsx')
const rollbackFn = history.slice(history.indexOf('const rollback'), history.indexOf('const groups'))
assert.ok(rollbackFn.includes('recordRollbackAudit'))
assert.ok(rollbackFn.indexOf('sftp.writeText') < rollbackFn.indexOf("audit('allowed')"))
assert.ok(rollbackFn.indexOf('beforeWrite()') < rollbackFn.indexOf("audit('allowed')"))
assert.ok(rollbackFn.includes("level === 'readonly' ? 'blocked' : 'cancelled'"))
const alertLine = read('src/renderer/src/components/AlertLine.tsx')
assert.ok(alertLine.includes('data-testid="w1-row-more"') && alertLine.includes("t('w1.create')") && alertLine.includes('onContextMenu'))
const workbench = read('src/renderer/src/components/AlertWorkbenchTab.tsx')
assert.ok(workbench.includes('onFixPlaybook') && workbench.includes('setHighlightCreate(true)') && workbench.includes('highlightCreate={highlightCreate}'))
assert.ok(workbench.includes('if (fixes) return'))
assert.ok(workbench.indexOf('if (fixes && fixes.length > 0)') < workbench.indexOf('setHighlightCreate(true)'))
const card = read('src/renderer/src/components/AiAssistCard.tsx')
assert.ok(card.includes('highlightCreate') && card.includes('is-highlight'))
const snapIpc = read('src/main/snapshot-ipc.ts')
assert.ok(!snapIpc.includes('snapshotKeep('))
assert.ok(snapIpc.includes('prefs.json') && snapIpc.includes('input.keep') && snapIpc.includes('shouldRecordSnapshot'))
const preload = read('src/preload/index.ts')
assert.ok(preload.includes('snapshotKeep()') && preload.includes('snapshotsEnabled()') && preload.includes("'snapshots:setPrefs'"))
const labels = read('src/shared/tab-label.ts')
assert.ok(labels.includes("settings: 'settings.title'") && !labels.includes('menu.settings'))
const toolbar = read('src/renderer/src/components/AppToolbar.tsx')
assert.ok(!/[📊🧰📁🔍☰]/.test(toolbar))
assert.ok(toolbar.includes('name="menu"') && toolbar.includes('name="search"') && toolbar.includes("icon: 'activity'"))

function emojiCount(extra = ''): number {
  const re = /\p{Extended_Pictographic}/gu
  let n = extra.match(re)?.length ?? 0
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.tsx')) n += read(p).match(re)?.length ?? 0
    }
  }
  walk('src/renderer/src')
  return n
}
assert.equal(emojiCount(), 46)
assert.ok(emojiCount('▶') > 46)

console.log('test-v042 ok')
