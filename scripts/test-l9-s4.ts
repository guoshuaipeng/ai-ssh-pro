/** L9 reconnect policy + S4 session read-only. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoReconnectDelay } from '../src/shared/workspace-features'
import {
  DEFAULT_RECONNECT_POLICY,
  clearStagedCommands,
  commandsAfterReconnect,
  currentReconnectEpoch,
  delayForAttempt,
  discardOnReconnect,
  hopsReconfirmed,
  keepaliveIntervalMs,
  loadReconnectPolicy,
  maxAttemptsFor,
  normalizeReconnectPolicy,
  noteStagedCommand,
  parseDelaySeconds,
  parseKeepAliveSec,
  resumeStartHop,
  saveReconnectPolicy
} from '../src/shared/reconnect-policy'
import {
  classifyShellLine,
  gateTerminalChunk,
  playbookRunDisabled,
  readonlyActive,
  stricterLevel
} from '../src/shared/readonly-session'
import { translate } from '../src/renderer/src/lib/i18n'
import { paletteMatch } from '../src/renderer/src/lib/palette'
import { SHARED_MENUS } from '../src/shared/menus'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.4.9')

const standard = { ...DEFAULT_RECONNECT_POLICY, mode: 'standard' as const }
assert.equal(maxAttemptsFor(standard), 3)
assert.equal(delayForAttempt(standard, 1), autoReconnectDelay(1))
assert.equal(delayForAttempt(standard, 1), 2000)
assert.equal(delayForAttempt(standard, 2), 5000)
assert.equal(delayForAttempt(standard, 3), 10_000)
assert.equal(delayForAttempt(standard, 4), null)

const robust = { ...DEFAULT_RECONNECT_POLICY, mode: 'robust' as const, robustMaxAttempts: 5 }
assert.deepEqual(
  [1, 2, 3, 4, 5, 6].map((n) => delayForAttempt(robust, n)),
  [2000, 5000, 10_000, 20_000, 40_000, null]
)
assert.equal(normalizeReconnectPolicy({ ...robust, robustMaxAttempts: 99 }).robustMaxAttempts, 8)
assert.equal(normalizeReconnectPolicy({ ...robust, robustMaxAttempts: 1 }).robustMaxAttempts, 3)
assert.equal(maxAttemptsFor(normalizeReconnectPolicy({ ...robust, robustMaxAttempts: 99 })), 8)

const custom = {
  ...DEFAULT_RECONNECT_POLICY,
  mode: 'custom' as const,
  customDelaysSec: [2, 9],
  customMaxAttempts: 3
}
assert.deepEqual(
  [1, 2, 3, 4].map((n) => delayForAttempt(custom, n)),
  [2000, 9000, 9000, null]
)
assert.equal(delayForAttempt({ ...DEFAULT_RECONNECT_POLICY, mode: 'off' }, 1), null)
assert.equal(maxAttemptsFor({ ...DEFAULT_RECONNECT_POLICY, mode: 'off' }), 0)

assert.deepEqual(parseDelaySeconds('2, 5, 10'), { ok: true, delaysSec: [2, 5, 10] })
assert.equal(parseDelaySeconds('0, 5').ok, false)
assert.equal(parseDelaySeconds('121').ok, false)
assert.equal(parseDelaySeconds('').ok, false)
assert.equal(parseDelaySeconds('1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11').ok, false)
assert.deepEqual(parseKeepAliveSec('15'), { ok: true, sec: 15 })
assert.deepEqual(parseKeepAliveSec('300'), { ok: true, sec: 300 })
assert.equal(parseKeepAliveSec('14').ok, false)
assert.equal(parseKeepAliveSec('301').ok, false)

assert.equal(keepaliveIntervalMs(undefined), 15_000)
assert.equal(keepaliveIntervalMs(null), 0)
assert.equal(keepaliveIntervalMs(0), 0)
assert.equal(keepaliveIntervalMs(60), 60_000)
assert.equal(keepaliveIntervalMs(10), 15_000)
assert.equal(keepaliveIntervalMs(400), 300_000)

const mem = new Map<string, string>()
const store = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  }
}
const saved = saveReconnectPolicy({ ...DEFAULT_RECONNECT_POLICY, mode: 'robust', keepAliveSec: 30 }, store)
assert.equal(saved.keepAliveSec, 30)
assert.equal(loadReconnectPolicy(store).mode, 'robust')
assert.equal(loadReconnectPolicy({ getItem: () => '{' }).mode, 'standard')

assert.equal(resumeStartHop(3, 2, true, false), 2)
assert.equal(resumeStartHop(3, 2, true, true), 1)
assert.equal(resumeStartHop(3, 1, true, false), 1)
assert.equal(resumeStartHop(3, 2, false, false), 1)
assert.equal(resumeStartHop(1, 2, true, false), 1)
assert.deepEqual(hopsReconfirmed(3, 2), [2, 3])
assert.deepEqual(hopsReconfirmed(3, 1), [1, 2, 3])

clearStagedCommands()
const epoch = currentReconnectEpoch()
noteStagedCommand({ command: 'rm -rf /tmp/x', confirmed: false, dangerous: true })
assert.deepEqual(commandsAfterReconnect([{ command: 'rm -rf /tmp/x', confirmed: false, dangerous: true }]), [])
assert.deepEqual(discardOnReconnect(), [])
assert.equal(currentReconnectEpoch(), epoch + 1)
assert.notEqual(epoch, currentReconnectEpoch())

assert.equal(classifyShellLine('ls -la /var'), 'read')
assert.equal(classifyShellLine('cat /etc/hostname'), 'read')
assert.equal(classifyShellLine('echo hi 2>&1'), 'read')
assert.equal(classifyShellLine('rm -rf /tmp/x'), 'write')
assert.equal(classifyShellLine('sudo rm /tmp/x'), 'write')
assert.equal(classifyShellLine('echo hi > /tmp/x'), 'write')
assert.equal(classifyShellLine('systemctl restart nginx'), 'write')
assert.equal(classifyShellLine('sed -i s/a/b/ /etc/x'), 'write')

const typed = gateTerminalChunk('rm -rf /tmp/x', '\n')
assert.equal(typed.send, '')
assert.equal(typed.clear, '\u0015')
assert.equal(typed.block?.multiline, false)

const paste = gateTerminalChunk('', 'ls\nrm -rf /tmp/x\n')
assert.equal(paste.send, '')
assert.equal(paste.clear, '')
assert.equal(paste.block?.multiline, true)

const readPaste = gateTerminalChunk('', 'ls\ncat /etc/hostname\n')
assert.equal(readPaste.send, 'ls\ncat /etc/hostname\n')
assert.equal(readPaste.block, null)

const typing = gateTerminalChunk('', 'ls')
assert.equal(typing.send, 'ls')
assert.equal(typing.block, null)

const strict = gateTerminalChunk('echo hi', '\n', () => {
  throw new Error('classifier down')
})
assert.equal(strict.send, '')
assert.ok(strict.block)

assert.equal(stricterLevel('production', true), 'readonly')
assert.equal(stricterLevel('readonly', false), 'readonly')
assert.equal(stricterLevel('normal', false), 'normal')
assert.equal(stricterLevel('production', false), 'production')
assert.equal(readonlyActive('readonly', false), true)
assert.equal(readonlyActive('readonly', true), false)
assert.equal(readonlyActive('production', false), false)
assert.equal(playbookRunDisabled(['readonly', 'readonly']), true)
assert.equal(playbookRunDisabled(['readonly', 'normal']), false)
assert.equal(playbookRunDisabled([]), false)

assert.ok(zh('l9.section').includes('重连'))
assert.ok(en('l9.section').toLowerCase().includes('reconnect'))
assert.ok(zh('l9.now').includes('重连'))
assert.ok(en('l9.retryHop', { n: 2 }).toLowerCase().includes('hop'))
assert.ok(zh('s4.badge').includes('只读'))
assert.ok(en('s4.banner').toLowerCase().includes('read-only'))
assert.ok(zh('s4.blockPaste').length > 0)
assert.ok(en('s4.runDisabled').toLowerCase().includes('dry'))

assert.ok(paletteMatch('重连策略', 'zh-CN').includes('reconnectPolicy'))
assert.ok(paletteMatch('readonly session', 'en').includes('readonlyOn'))
assert.ok(paletteMatch('保护级别', 'zh-CN').includes('setProtection'))

const menuIds = SHARED_MENUS.flatMap((m) => m.items.map((item) => ('action' in item ? item.action : ''))).filter(Boolean)
assert.equal(menuIds.includes('reconnectPolicy'), false)
assert.equal(menuIds.includes('readonlyOn'), false)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const ssh = readFileSync('src/main/ssh-manager.ts', 'utf8')
const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
const play = readFileSync('src/renderer/src/components/PlaybookTabs.tsx', 'utf8')
const tools = readFileSync('src/renderer/src/components/ServerToolsModal.tsx', 'utf8')
const audit = readFileSync('src/shared/audit-log.ts', 'utf8')
assert.match(app, /discardOnReconnect\(/)
assert.match(app, /gateTerminalChunk/)
assert.match(app, /session\.readonly\.on/)
assert.match(ssh, /jumpSlots/)
assert.match(ssh, /resumeFromHop/)
assert.match(ssh, /keepaliveIntervalMs/)
assert.match(sftp, /remoteWritesBlocked/)
assert.match(play, /playbookRunDisabled/)
assert.match(tools, /writesDisabled/)
assert.match(audit, /session\.reconnect\.fail/)
assert.match(audit, /session\.reconnect\.stop/)
assert.match(audit, /session\.readonly\.off/)
assert.doesNotMatch(readFileSync('src/renderer/src/components/DisconnectBanner.tsx', 'utf8'), /window\.confirm/)
assert.doesNotMatch(readFileSync('src/renderer/src/components/ReconnectPolicySection.tsx', 'utf8'), /window\.confirm/)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
assert.match(changelog, /重连策略（L9）/)
assert.match(changelog, /A-OM \/ A-HITL/)
const context = readFileSync('src/main/core-a-context.ts', 'utf8')
assert.match(context, /observationalMemory/)
assert.match(context, /export function interruptForProposal/)
assert.match(readFileSync('src/shared/ipc.ts', 'utf8'), /'observations'/)
assert.equal(readFileSync('tests/fixtures/core-a/core-a-s13-observational-memory.json', 'utf8').includes('observational'), true)
assert.equal(readFileSync('tests/fixtures/core-a/core-a-s14-hitl-interrupt.json', 'utf8').includes('interrupt'), true)

console.log('l9-s4 ok')
