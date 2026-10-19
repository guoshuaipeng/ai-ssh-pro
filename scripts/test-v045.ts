/** v0.4.5 soft-start: L2d, W6, A5, W7, L7d, L8b, UX-41, UX-59. Package stays 0.4.4. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clickLoop, deriveProgress, loadLoopPrefs, markLoop, saveLoopPrefs } from '../src/shared/alert-loop'
import { DEMO_PROFILE_ID, DEMO_WELCOME_EN, DEMO_WELCOME_HINT_EN, DEMO_WELCOME_HINT_ZH, DEMO_WELCOME_ZH, demoWelcome, demoWelcomeForProfile } from '../src/shared/demo-host'
import { findDiffDraft, planDiffFix } from '../src/shared/diff-fix'
import { buildProbeCommand, probeExtrasOf, probeSections } from '../src/shared/health-probe'
import {
  bellShouldFlash,
  endMaintenance,
  expireDue,
  loadMaintenance,
  recordFor,
  shouldNotify,
  silenceUntil,
  startMaintenance
} from '../src/shared/maintenance'
import { isDue, noteDryRun, planReminderNotices, setCadence, snoozeReminder } from '../src/shared/playbook-reminder'
import type { Playbook } from '../src/shared/playbook'
import {
  commandActions,
  draftFromAssist,
  exportPostmortemMarkdown,
  isEmptyTimeline,
  planPostmortem,
  scrub
} from '../src/shared/postmortem-ai'
import { arrangeTabs, closeOthers, closeRight } from '../src/shared/tab-actions'
import type { TimelineEvent } from '../src/shared/timeline'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; build?: { win?: Record<string, unknown> } }
assert.equal(pkg.version, '0.6.51')
assert.equal('fileVersion' in (pkg.build?.win ?? {}), false)
const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
assert.ok(changelog.startsWith('# Changelog\n\n## Unreleased'))
for (const id of ['L2d', 'W6', 'A5', 'W7', 'L7d', 'L8b', 'UX-41', 'UX-59']) assert.ok(changelog.includes(id), id)
assert.ok(changelog.includes('v0.4.5 soft-start'))

const mem = () => {
  const bag = new Map<string, string>()
  return {
    getItem: (k: string) => bag.get(k) ?? null,
    setItem: (k: string, v: string) => {
      bag.set(k, v)
    }
  }
}

const store = mem()
const started = startMaintenance({ scope: 'hosts', hostKeys: ['web-1'], hours: 2, now: 1_000 }, store)
assert.equal(started.ok, true)
if (!started.ok) throw new Error('start')
assert.equal(started.record.command, null)
assert.equal(started.record.executes, false)
assert.equal(recordFor('alert.maintenance.start', started.window).command, null)
assert.equal(shouldNotify(loadMaintenance(store), { keys: ['web-1'] }, 1_000), false)
assert.equal(shouldNotify(loadMaintenance(store), { keys: ['other'] }, 1_000), true)
assert.equal(bellShouldFlash([{ keys: ['web-1'] }], loadMaintenance(store), 1_000), false)
assert.equal(bellShouldFlash([{ keys: ['other'] }], loadMaintenance(store), 1_000), true)
const until = silenceUntil(loadMaintenance(store), { keys: ['web-1'] }, 1_000)
assert.equal(until, started.window.endsAt)
const tagged = startMaintenance({ scope: 'tags', tagIds: ['prod'], hours: 1, now: 2_000 }, store)
assert.equal(tagged.ok, true)
assert.equal(shouldNotify(loadMaintenance(store), { keys: ['db'], tags: ['prod'] }, 2_000), false)
assert.equal(startMaintenance({ scope: 'hosts', hostKeys: [], hours: 2 }, store).ok, false)
assert.equal(startMaintenance({ scope: 'hosts', hostKeys: ['a'], hours: 0.1 }, store).ok, false)
if (tagged.ok) {
  const ended = endMaintenance(tagged.window.id, 'user', store, 3_000)
  assert.equal(ended?.record.kind, 'alert.maintenance.end')
  assert.equal(ended?.record.executes, false)
}
const expired = expireDue(store, started.window.endsAt + 1)
assert.ok(expired.some((r) => r.kind === 'alert.maintenance.expire' && r.command === null))
assert.ok(loadMaintenance(store).some((w) => w.id === started.window.id && w.status === 'expired'))

const week = 7 * 24 * 60 * 60 * 1000
let reminders = setCadence([], 'pb-1', 'weekly', 0)
assert.equal(isDue(reminders[0]!, week - 1), false)
assert.equal(isDue(reminders[0]!, week), true)
const planned = planReminderNotices(reminders, { 'pb-1': 'Disk' }, week)
assert.equal(planned.notices.length, 1)
assert.equal(planned.notices[0]!.focus, 'dry-run')
assert.equal(planned.notices[0]!.executes, false)
assert.equal('command' in planned.notices[0]!, false)
const again = planReminderNotices(planned.next, { 'pb-1': 'Disk' }, week + 1000)
assert.equal(again.notices.length, 0)
reminders = noteDryRun(planned.next, 'pb-1', week + 5000)
assert.equal(isDue(reminders.find((r) => r.playbookId === 'pb-1')!, week + 5000), false)
const snoozed = snoozeReminder(setCadence([], 'pb-2', 'monthly', 0), 'pb-2', 10)
assert.ok((snoozed[0]!.nextDueAt ?? 0) > 30 * 24 * 60 * 60 * 1000)
assert.equal(setCadence([], 'pb-3', 'off', 0)[0]!.nextDueAt, null)
const offNotice = planReminderNotices(setCadence([], 'pb-3', 'off', 0), { 'pb-3': 'Quiet' }, week)
assert.equal(offNotice.notices.length, 0)

const firedOnly = [{ kind: 'alert.fired' }]
assert.equal(isEmptyTimeline(firedOnly), true)
assert.equal(isEmptyTimeline([]), true)
assert.equal(planPostmortem(false, [{ kind: 'note' }]), 'need-ai')
assert.equal(planPostmortem(true, firedOnly), 'empty')
assert.equal(planPostmortem(true, [{ kind: 'note' }]), 'generate')
const draft = draftFromAssist(
  [{ id: 'e1', alertId: 'a', at: 1, kind: 'note', hostKey: 'h', summary: 'checked disk' } as TimelineEvent],
  { cause: 'disk full password=hunter2', notes: 'watch inode', fixes: [{ command: 'df -h' }, { command: 'token=abc rm -rf /' }] }
)
assert.ok(!draft.cause.includes('hunter2'))
assert.equal(commandActions(draft).every((a) => a.copy === true && a.run === false), true)
const md = exportPostmortemMarkdown(draft, 'en')
assert.ok(md.includes('## Cause'))
assert.ok(md.includes('## What we did'))
assert.ok(md.includes('## Follow-ups'))
assert.ok(!md.toLowerCase().includes('password='))
assert.ok(!md.toLowerCase().includes('token='))
assert.ok(!scrub('-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----').includes('secret'))

const loopStore = mem()
assert.equal(loadLoopPrefs(loopStore).show, true)
saveLoopPrefs(false, loopStore)
assert.equal(loadLoopPrefs(loopStore).show, false)
const progress = deriveProgress([{ kind: 'alert.locate' }, { kind: 'ai.explain' }], markLoop('al-1', 'diff', loopStore))
assert.equal(progress.locate && progress.ai && progress.diff && progress.playbook === false, true)
assert.equal(clickLoop('playbook', { locate: true, ai: false, playbook: false, diff: false }, { aiConfigured: true, hasDraft: false }).action, 'playbook-toast')
assert.equal(clickLoop('diff', progress, { aiConfigured: true, hasDraft: false }).action, 'diff-open')
assert.equal(clickLoop('ai', progress, { aiConfigured: false, hasDraft: false }).action, 'need-ai')

assert.deepEqual(probeSections(probeExtrasOf({ extraLoad: false, extraInode: false, extraMounts: false, mounts: ['/'] })), ['cpu', 'mem', 'disk'])
const extrasOn = probeExtrasOf({ extraLoad: true, extraInode: true, extraMounts: true, mounts: ['/', '/var', '/etc/../x'] })
assert.deepEqual(probeSections(extrasOn), ['cpu', 'mem', 'disk', 'load', 'inode', 'mounts'])
const cmd = buildProbeCommand(extrasOn)
assert.ok(cmd.includes('@@LOAD@@'))
assert.ok(cmd.includes('@@INODE@@'))
assert.ok(cmd.includes('@@MOUNTS@@'))
assert.ok(!cmd.includes('..'))
const cmdOff = buildProbeCommand(probeExtrasOf({ extraLoad: false, extraInode: false, extraMounts: false, mounts: ['/'] }))
assert.ok(!cmdOff.includes('@@LOAD@@'))
assert.ok(!cmdOff.includes('@@INODE@@'))
assert.ok(!cmdOff.includes('@@MOUNTS@@'))

assert.equal(planDiffFix({ aiConfigured: false, hasExplanation: false, fixes: null, hostKey: 'h', hostTitle: 'H', path: '/a' }).action, 'need-ai')
assert.equal(planDiffFix({ aiConfigured: true, hasExplanation: false, fixes: [{ command: 'df' }], hostKey: 'h', hostTitle: 'H', path: '/a' }).action, 'explain-first')
assert.equal(planDiffFix({ aiConfigured: true, hasExplanation: true, fixes: [], hostKey: 'h', hostTitle: 'H', path: '/a' }).action, 'no-fixes')
const drafted = planDiffFix({
  aiConfigured: true,
  hasExplanation: true,
  fixes: [{ command: 'rm -rf /' }],
  hostKey: 'h',
  hostTitle: 'H',
  path: '/etc/app.conf'
})
assert.equal(drafted.action, 'draft')
if (drafted.action === 'draft') {
  assert.equal(drafted.origin.kind, 'diff')
  assert.equal(drafted.origin.path, '/etc/app.conf')
  assert.ok(drafted.dangerous.length >= 1)
}
const existing: Playbook = {
  id: 'd1',
  name: 'diff',
  description: '',
  draft: true,
  steps: [],
  origin: { kind: 'diff', hostKey: 'h', hostTitle: 'H', path: '/etc/app.conf', at: 1 },
  updatedAt: 1
}
assert.equal(findDiffDraft([existing], 'h', '/etc/app.conf')?.id, 'd1')
assert.equal(
  planDiffFix({ aiConfigured: true, hasExplanation: true, fixes: [{ command: 'true' }], existingDraftId: 'd1', hostKey: 'h', hostTitle: 'H', path: '/etc/app.conf' }).action,
  'focus'
)

assert.ok(demoWelcome('zh-CN').includes(DEMO_WELCOME_ZH))
assert.ok(demoWelcome('zh-CN').includes(DEMO_WELCOME_HINT_ZH))
assert.ok(demoWelcome('en').includes(DEMO_WELCOME_EN))
assert.ok(demoWelcome('en').includes(DEMO_WELCOME_HINT_EN))
assert.equal(demoWelcomeForProfile('other', 'en'), null)
assert.ok(demoWelcomeForProfile(DEMO_PROFILE_ID, 'zh-CN')!.includes(DEMO_WELCOME_ZH))

const tabs = [
  { id: 'home', view: 'home', seq: 1 },
  { id: 'a', view: 'session', seq: 2 },
  { id: 'pin', view: 'monitor', seq: 3, pinned: true },
  { id: 'b', view: 'file-diff', seq: 4 }
]
assert.deepEqual(arrangeTabs(tabs).map((t) => t.id), ['pin', 'home', 'a', 'b'])
assert.deepEqual(closeOthers(tabs, 'a').sort(), ['b'])
assert.deepEqual(closeRight(tabs, 'a'), { close: ['b'], disabled: false })
assert.equal(closeRight(tabs, 'b').disabled, true)
assert.deepEqual(closeRight([{ id: 'a', seq: 1 }, { id: 'pin', seq: 2, pinned: true }], 'a').close, [])

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const tick = readFileSync('src/renderer/src/lib/reminder-tick.ts', 'utf8')
assert.ok(app.includes('alert-maintenance'))
assert.ok(app.includes('alert-postmortem-ai'))
assert.ok(app.includes('collectReminderNotice'))
assert.ok(app.includes('REMINDER_FOCUS_EVENT'))
assert.ok(!tick.includes('dryRun'))
assert.ok(!tick.includes('ssh.'))
assert.ok(!tick.includes('.exec('))
assert.ok(tick.includes("focus: 'dry-run'") || readFileSync('src/shared/playbook-reminder.ts', 'utf8').includes("focus: 'dry-run'"))
assert.ok(!readFileSync('src/shared/playbook-reminder.ts', 'utf8').includes('daily'))
assert.ok(app.includes('shouldNotify'))
assert.ok(app.includes('probeExtrasOf'))
assert.ok(app.includes('ux59-menu'))
assert.ok(app.includes('tab.closeOthers') || readFileSync('src/shared/inline-menus.ts', 'utf8').includes('tab.closeOthers'))
assert.equal(readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8').includes("'tab.closeOthers': 'Close other tabs'"), true)
assert.ok(!readFileSync('src/renderer/src/components/FileDiffView.tsx', 'utf8').includes('window.confirm'))
assert.ok(!readFileSync('src/renderer/src/components/MaintenanceTab.tsx', 'utf8').includes('window.confirm'))
assert.ok(!readFileSync('src/renderer/src/components/PostmortemAiTab.tsx', 'utf8').includes('window.confirm'))
const testScript = readFileSync('package.json', 'utf8')
assert.ok(testScript.includes('test-v044-soft'))
assert.ok(testScript.includes('test-ux64'))
assert.ok(testScript.includes('test-sftp-hotfix'))
assert.ok(testScript.includes('test-v045'))

console.log('v0.4.5 soft-start ok')
