/** v0.4.0-m2: playbooks, sync vault, blocks, jump chain, file pin, audit export, recordings. */
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { KEYMAP, matchKeymap } from '../src/shared/keymap'
import { SHARED_MENUS } from '../src/shared/menus'
import {
  ensureSamples,
  hostSelectable,
  importPlaybook,
  exportPlaybook,
  runPlaybook,
  samplePlaybooks,
  stepNeedsConfirm
} from '../src/shared/playbook'
import { applyChoice, buildVault, findConflicts, overwriteLocalAllowed, redactSecrets, statusGlyph, vaultHasSecrets } from '../src/shared/sync-vault'
import { blocksEnabled, disableBlocksKeepsScrollback, setBlocksEnabled, startBlock, upsertCommandSnippet } from '../src/shared/terminal-blocks'
import { chainFromLegacy, formatHopFailure, parseHopFailure, parseProxyJump, validateChain } from '../src/shared/jump-chain'
import { shouldPinSyncPreview } from '../src/shared/file-workflow'
import { auditToCsv, auditToJsonl, redactAuditText } from '../src/shared/audit-log'
import { decodeCast, encodeCast, playbackSchedule } from '../src/shared/asciicast'
import { detectKeyMaterial, skNeedsAgent } from '../src/shared/ssh-cert'

let n = 0
const ok = (cond: unknown, label: string) => {
  if (!cond) {
    console.error('FAIL', label)
    process.exit(1)
  }
  n += 1
}

const samples = samplePlaybooks()
ok(samples.every((p) => !/rm\s+-rf|reboot|shutdown/.test(JSON.stringify(p))), 'samples are not destructive')
ok(hostSelectable({ id: 'a', name: 'a', user: 'u', host: 'h', level: 'readonly' }) === false, 'readonly host not selectable')
ok(hostSelectable({ id: 'a', name: 'a', user: 'u', host: 'h', level: 'production' }), 'production host selectable')
const flagged = stepNeedsConfirm(samples[1]!.steps[1]!, 'systemctl is-active nginx', 'production')
ok(flagged.confirm && flagged.requireHostName, 'production confirm step asks for the host name')
const imported = importPlaybook(exportPlaybook(samples[0]!))
ok(imported.ok && imported.playbook.steps.length === 2, 'playbook round trip')
const ran = await runPlaybook({
  playbook: samples[0]!,
  hosts: [
    { id: 'ro', name: 'ro', user: 'u', host: 'h', level: 'readonly' },
    { id: 'ok', name: 'ok', user: 'u', host: 'h', level: 'normal' }
  ],
  mode: 'serial',
  parallelLimit: 2,
  confirm: async () => 'run',
  exec: async () => ({ code: 0, stdout: 'ok', stderr: '' })
})
ok(ran.cells.some((c) => c.hostId === 'ro' && c.state === 'skipped'), 'readonly never execs')
ok(ran.cells.some((c) => c.hostId === 'ok' && c.state === 'ok'), 'normal host runs')
ok(ensureSamples([]).length >= 2, 'empty list gets samples')

const secretProfile = {
  id: 'p1',
  label: 'web',
  host: 'h',
  port: 22,
  username: 'u',
  password: 's3cret',
  privateKeyPath: '/tmp/id',
  protection: 'normal' as const
}
const stripped = buildVault({ profiles: [secretProfile], scope: { credentials: false, connections: true, snippets: true, forwards: true, settings: true } })
ok(!vaultHasSecrets(stripped), 'credentials off strips secrets')
const kept = buildVault({ profiles: [secretProfile], scope: { credentials: true, connections: true, snippets: false, forwards: false, settings: false } })
ok(vaultHasSecrets(kept), 'credentials on keeps secrets')
const local = [{ id: 'connection:p1', kind: 'connection' as const, name: 'web', updatedAt: 20, body: { label: 'local' } }]
const remote = [{ id: 'connection:p1', kind: 'connection' as const, name: 'web', updatedAt: 20, deleted: true, body: { label: 'cloud' } }]
const conflicts = findConflicts(local, remote, { 'connection:p1': 10 })
ok(conflicts.length === 1 && conflicts[0]!.reason === 'delete-modify', 'delete-modify is a conflict')
const both = findConflicts(
  [{ id: 'connection:p1', kind: 'connection', name: 'web', updatedAt: 20, body: { label: 'local' } }],
  [{ id: 'connection:p1', kind: 'connection', name: 'web', updatedAt: 21, body: { label: 'cloud' } }],
  { 'connection:p1': 10 }
)
ok(applyChoice(both[0]!, 'both').some((i) => i.id.includes('cloud') || i.name.includes('cloud')), 'both keeps a renamed cloud copy')
ok(!overwriteLocalAllowed({ backupCompleted: false, skipConfirmed: false }).ok, 'overwrite needs a backup')
ok(overwriteLocalAllowed({ backupCompleted: true, skipConfirmed: false }).ok, 'backup allows overwrite')
ok(redactSecrets('token abc-secret failed', ['abc-secret']).includes('••••'), 'remote errors redact secrets')
ok(statusGlyph('synced') === '✓' && statusGlyph('syncing') === '⟳' && statusGlyph('conflict') === '!' && statusGlyph('error') === '✕', 'status glyphs')
ok(statusGlyph('off') === '', 'sync off hides the glyph')

const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
ok(blocksEnabled(store) === false, 'blocks default off')
setBlocksEnabled(true, store)
ok(blocksEnabled(store), 'blocks can turn on')
ok(disableBlocksKeepsScrollback().scrollbackKept, 'turning blocks off keeps scrollback')
ok(startBlock([], 'df -h')[0]?.command === 'df -h', 'block starts from the command')

const chain = chainFromLegacy({ host: 'bastion', username: 'jump', port: 22 })
ok(chain.length === 1, 'legacy jump becomes one hop')
const parsed = parseProxyJump('a@h1,b@h2:2200')
ok(parsed.hops.length === 2 && parsed.hops[1]!.port === 2200, 'ProxyJump parses two hops')
ok(validateChain([{ ...parsed.hops[0]!, host: 'target' }], 'target', new Set()).some((i) => i.code === 'cycle'), 'cycle detected')
const fail = formatHopFailure(2, 3, 'edge', '10.0.0.2:22', 'timeout')
ok(parseHopFailure(fail)?.hop === 2, 'hop failure round trip')

ok(shouldPinSyncPreview(51, false) && !shouldPinSyncPreview(50, false) && shouldPinSyncPreview(1, true), 'pin threshold')

const csv = auditToCsv([{ id: '1', at: 0, type: 'playbook.run', host: 'web', source: 'playbook', outcome: 'allowed', detail: 'disk' }])
ok(csv.includes('playbook.run') && auditToJsonl([{ id: '1', at: 0, type: 'danger', host: 'web', outcome: 'blocked', detail: 'rm' }]).includes('danger'), 'audit export')
ok(redactAuditText('password=hunter2').includes('••••'), 'audit redacts passwords')

const cast = encodeCast({ version: 2, width: 80, height: 24, timestamp: 1, title: 't' }, [{ time: 0, type: 'o', data: 'hi' }, { time: 5, type: 'o', data: '!' }])
const decoded = decodeCast(cast)
ok(decoded.ok && decoded.events.length === 2, 'asciicast v2')
const sched = playbackSchedule(decoded.ok ? decoded.events : [], 1, true)
ok(sched[1]!.at <= 1, 'idle gap is compressed')

ok(detectKeyMaterial('sk-ssh-ed25519@openssh.com AAAA') === 'sk-ed25519', 'sk key detected')
ok(skNeedsAgent('sk-ed25519', 'key') && !skNeedsAgent('sk-ed25519', 'agent'), 'sk needs an agent')

const ids = SHARED_MENUS.flatMap((m) => m.items.filter((it) => it.type === 'item').map((it) => it.id))
ok(ids.includes('playbooks') && ids.includes('cloudSync') && ids.includes('sessionRecordings') && ids.includes('toggleBlocks'), 'm2 menus')
ok(KEYMAP.some((k) => k.id === 'playbooks' && k.keys === 'Ctrl+Alt+P'), 'playbook shortcut')

const menuIds = (id: string) =>
  SHARED_MENUS.find((m) => m.id === id)!.items.map((it) => (it.type === 'sep' ? '|' : it.id))
const sessionIds = menuIds('session')
const viewIds = menuIds('view')
const opsIds = menuIds('ops')
ok(sessionIds.includes('sessionRecordings') && sessionIds.includes('toggleBlocks'), 'recordings and blocks live under Session')
ok(!opsIds.includes('sessionRecordings'), 'ops does not list session recordings')
ok(!viewIds.includes('toggleBlocks'), 'view stays shell-only')
ok(opsIds.join(',').includes('alertWorkbench,|,playbooks,runPlaybook'), 'ops order is alerts then playbooks')
ok(!KEYMAP.some((k) => k.id === 'toggleBlocks'), 'blocks toggle has no global shortcut')
ok(
  KEYMAP.some((k) => k.id === 'explainBlock' && k.keys === 'Ctrl+Shift+E' && k.scope === 'terminalBlocks'),
  'Ctrl+Shift+E explains a block'
)
ok(
  matchKeymap({ key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, false) === undefined &&
    matchKeymap({ key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }, true) === undefined,
  'Ctrl+Shift+E is not a global binding'
)

const palette = readFileSync('src/renderer/src/lib/palette.ts', 'utf8')
ok(!palette.includes('vault'), 'palette does not alias cloud sync as vault')
const appSrc = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(appSrc.includes('runCloudSync') && !appSrc.includes("action === 'cloudSync' || action === 'syncNow'"), 'sync now is not the settings opener')
ok(appSrc.includes('runFolderSyncDurable') && appSrc.includes("addEventListener('aiss-run-sync'"), 'pinned preview and the sync event both run the write-gated handler')
ok(!appSrc.includes("new CustomEvent('aiss-run-sync'"), 'sync start does not fire an unhandled event')
ok(appSrc.includes('beforeRemoteWrite') && appSrc.includes('remoteWritesBlocked'), 'remote editor is given the write gate')
const editor = readFileSync('src/renderer/src/components/RemoteTextEditor.tsx', 'utf8')
const doSave = editor.slice(editor.indexOf('const doSave'), editor.indexOf('const requestSave'))
ok(doSave.includes('await beforeRemoteWrite()') && doSave.indexOf('await beforeRemoteWrite()') < doSave.indexOf('sftp.writeText'), 'editor save is gated')
const runner = readFileSync('src/renderer/src/lib/folder-sync-run.ts', 'utf8')
const durable = runner.slice(runner.indexOf('export async function runFolderSyncDurable'))
ok(
  durable.includes('await beforeRemoteWrite()') &&
    durable.indexOf('await beforeRemoteWrite()') < durable.indexOf('sftp.transfer') &&
    durable.indexOf('await beforeRemoteWrite()') < durable.indexOf('sftp.remove'),
  'durable folder sync is gated'
)
ok(readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8').includes('registerFolderSyncRunner'), 'sftp panel registers a durable runner')
const recordings = readFileSync('src/renderer/src/components/RecordingsTab.tsx', 'utf8')
ok(recordings.includes('askConfirm') && recordings.includes('danger: true') && recordings.indexOf('askConfirm') < recordings.indexOf('recordings.delete'), 'delete asks first')
const blocks = readFileSync('src/renderer/src/components/TerminalBlocks.tsx', 'utf8')
ok(blocks.includes('upsertCommandSnippet') && blocks.includes('snippets.save') && blocks.includes("e.key.toLowerCase() !== 'e'"), 'snippet save upserts and explain is block-scoped')
const inserted = upsertCommandSnippet([], { title: 'df', body: 'df -h' }, 'a')
const updated = upsertCommandSnippet(inserted, { title: 'df', body: 'df -hT' }, 'b')
ok(inserted.length === 1 && updated.length === 1 && updated[0]!.id === 'a' && updated[0]!.body === 'df -hT', 'snippet upsert replaces by title')
ok(upsertCommandSnippet(updated, { title: 'df', body: 'df -hT' }, 'c') === updated, 'unchanged snippet is not rewritten')
ok(readFileSync('src/renderer/src/components/JumpChainEditor.tsx', 'utf8').includes('jump-chips'), 'jump chain has a chip row')

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
ok(pkg.version === '0.6.57', 'package version')
ok(changelogFor('0.4.0').some((e) => e.action === 'playbooks'), 'whats new 0.4.0')
ok(changelogFor('0.4.0-m2').some((e) => e.action === 'playbooks'), 'whats new m2')
const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
ok(changelog.includes('## v0.4.2\n') && changelog.includes('## v0.4.1\n') && changelog.includes('## v0.4.0\n') && changelog.includes('## v0.4.0-m2') && changelog.includes('## v0.4.0-m1'), 'changelog sections')

const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
const mkdirFn = sftp.slice(sftp.indexOf('const mkdir ='), sftp.indexOf('const renameEntry ='))
const renameFn = sftp.slice(sftp.indexOf('const renameEntry ='), sftp.indexOf('const summary ='))
ok(mkdirFn.includes('allowRemoteWrite') && mkdirFn.indexOf('allowRemoteWrite') < mkdirFn.indexOf('sftp.mkdir'), 'C1 mkdir gate')
ok(renameFn.includes('allowRemoteWrite') && renameFn.indexOf('allowRemoteWrite') < renameFn.indexOf('sftp.rename'), 'C1 rename gate')
const runSync = sftp.slice(sftp.indexOf('const runSync ='), sftp.indexOf('runSyncRef.current = runSync'))
ok(runSync.includes('allowRemoteWrite'), 'sync start uses the write gate')

const prot = readFileSync('src/renderer/src/components/ProtectionSection.tsx', 'utf8')
ok(!prot.includes('disabled') || !prot.includes("type=\"checkbox\" disabled"), 'auto-record is not a disabled checkbox')
ok(prot.includes('onAutoRecord'), 'auto-record is wired')
ok(readFileSync('src/main/session-recorder.ts', 'utf8').includes('encodeHeaderLine'), 'recorder writes asciicast')
ok(readFileSync('src/main/ssh-manager.ts', 'utf8').includes('formatHopFailure'), 'connect names the failed hop')

console.log(`test-round19 ok (${n})`)
