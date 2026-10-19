/** v0.4.4 soft-start: L2c packs, L7c sampling, W5 share packs, S2b gate timeline, UX-60. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALERT_PACKS, enableAlertPack, packPayloadHasNoExecution, packStatus, removeAlertPack } from '../src/shared/alert-rule-packs'
import { evaluateAlerts, loadAlertRules } from '../src/shared/alert-rules'
import { appendAudit, appendGate, clearAudit, gateToCsv, loadAudit, loadGateEvents, setAuditEnabled } from '../src/shared/audit-log'
import {
  DEFAULT_PROBE_PREFS,
  applyProbeFilters,
  clampBackoffCap,
  idsToRetry,
  nextBackoffMs,
  probeFiltersActive,
  retryAllAllowed,
  selectProbeTargets,
  type ProbeCandidate
} from '../src/shared/health-probe'
import { decideQuickStart, loadFreshProfile, noteInstall, QUICK_STEPS } from '../src/shared/onboarding'
import type { Playbook } from '../src/shared/playbook'
import {
  applyShareImport,
  assertNoSecretKeys,
  buildSharePlain,
  decodeSharePack,
  encodeSharePack,
  previewShareImport
} from '../src/shared/playbook-share'
import { viewTimeline } from '../src/shared/timeline'
import type { CastEvent } from '../src/shared/asciicast'
import { clampGifMax, clipCastEvents, clipGifAllowed, clipMarkdown } from '../src/shared/cast-clip'
import { gifFromTextFrames } from '../src/shared/cast-gif'
import { hopVisual } from '../src/shared/hop-chip'
import { planAlertFix } from '../src/renderer/src/lib/alert-fix'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.39')

const mem = () => {
  const bag = new Map<string, string>()
  return {
    getItem: (k: string) => bag.get(k) ?? null,
    setItem: (k: string, v: string) => {
      bag.set(k, v)
    },
    removeItem: (k: string) => {
      bag.delete(k)
    }
  }
}

assert.deepEqual(ALERT_PACKS.map((p) => p.id), ['pack.cpu-high', 'pack.disk-full', 'pack.proc-svc'])
for (const pack of ALERT_PACKS) assert.equal(packPayloadHasNoExecution(pack), true)

const rules = loadAlertRules(mem())
const cpu = enableAlertPack(rules, 'pack.cpu-high', { scope: 'hosts', hostIds: ['h1'], sustainMin: 0 })
assert.equal(cpu.status, 'wrote')
assert.equal(enableAlertPack(cpu.state, 'pack.cpu-high').status, 'duplicate')
assert.equal(cpu.state.rules.filter((r) => r.packId === 'pack.cpu-high').length, 1)
const again = enableAlertPack(cpu.state, 'pack.cpu-high', { hostIds: ['h9'] })
assert.equal(again.state, cpu.state)
const disk = enableAlertPack(cpu.state, 'pack.disk-full')
const proc = enableAlertPack(disk.state, 'pack.proc-svc', { unit: 'sshd' })
assert.equal(proc.state.packRules.filter((r) => r.packId === 'pack.proc-svc').length, 1)
assert.equal(proc.state.packRules[0]?.unit, 'sshd')
assert.equal(JSON.stringify(proc.state).includes('"command"'), false)
const dropped = removeAlertPack(proc.state, 'pack.cpu-high')
assert.equal(packStatus(dropped, 'pack.cpu-high').enabled, false)
assert.equal(dropped.rules.find((r) => r.id === 'cpu')?.sustainMin, 5)
assert.equal(dropped.rules.find((r) => r.id === 'cpu')?.packId, undefined)

const breach = new Map<string, number>()
const last = new Map<string, number>()
const readings = [{ metric: 'cpu' as const, value: 95 }]
const hit = evaluateAlerts({
  hostKey: 's1',
  hostTitle: 'web',
  rules: cpu.state.rules,
  readings,
  breachSince: breach,
  lastFiredAt: last,
  now: 2_000_000_000,
  profileId: 'h1'
})
assert.equal(hit.length, 1)
const miss = evaluateAlerts({
  hostKey: 's2',
  hostTitle: 'other',
  rules: cpu.state.rules,
  readings,
  breachSince: new Map(),
  lastFiredAt: new Map(),
  now: 2_000_000_000,
  profileId: 'h2'
})
assert.equal(miss.length, 0)

const hosts: ProbeCandidate[] = [
  { profileId: 'a', order: 0, alerting: false, protection: 'production', tags: ['web'] },
  { profileId: 'b', order: 1, alerting: false, protection: 'readonly', tags: ['db'] },
  { profileId: 'c', order: 2, alerting: false, protection: 'normal', tags: ['web'] }
]
const wide = { ...DEFAULT_PROBE_PREFS, scope: 'all' as const, maxConcurrent: 30, excludeReadonly: false, prodOnly: false, filterTags: false, tags: [] }
assert.equal(probeFiltersActive(wide), false)
assert.deepEqual(selectProbeTargets(hosts, wide, { grouped: false }).map((h) => h.profileId), ['a', 'b', 'c'])
assert.deepEqual(applyProbeFilters(hosts, wide).map((h) => h.profileId), ['a', 'b', 'c'])
assert.deepEqual(
  selectProbeTargets(hosts, { ...wide, prodOnly: true }, { grouped: false }).map((h) => h.profileId),
  ['a']
)
assert.deepEqual(
  selectProbeTargets(hosts, { ...wide, excludeReadonly: true }, { grouped: false }).map((h) => h.profileId),
  ['a', 'c']
)
assert.deepEqual(
  selectProbeTargets(hosts, { ...wide, filterTags: true, tags: ['web'] }, { grouped: false }).map((h) => h.profileId),
  ['a', 'c']
)
assert.equal(DEFAULT_PROBE_PREFS.excludeReadonly, true)
assert.equal(nextBackoffMs(1), 30_000)
assert.equal(nextBackoffMs(2), 60_000)
assert.equal(nextBackoffMs(3), 120_000)
assert.equal(nextBackoffMs(4), 300_000)
assert.equal(nextBackoffMs(4, 1), 60_000)
assert.equal(clampBackoffCap(0), 1)
assert.equal(clampBackoffCap(99), 30)
assert.deepEqual(idsToRetry(['b'], ['a', 'b', 'c']), ['b'])
assert.equal(retryAllAllowed(1_000, 10_999), false)
assert.equal(retryAllAllowed(1_000, 11_000), true)

const book: Playbook = {
  id: 'pb1',
  name: 'Restart',
  description: 'echo password=hunter2',
  steps: [
    {
      id: 's1',
      type: 'command',
      command: 'echo password=hunter2\n-----BEGIN OPENSSH PRIVATE KEY-----\nsecret\n-----END OPENSSH PRIVATE KEY-----',
      confirm: true,
      stopOnError: true,
      timeoutSec: 30
    }
  ],
  updatedAt: 1,
  vars: [
    { name: 'token', required: false, sensitive: true, quote: true, defaultValue: 's3cret-token' },
    { name: 'unit', required: false, sensitive: false, quote: true, defaultValue: 'sshd' }
  ],
  origin: { kind: 'alert', hostKey: 'should-drop', hostTitle: 'web', ruleId: 'cpu', at: 1 }
}
const plain = buildSharePlain([book], [{ title: 'web-01', tags: ['prod'], password: 'nope', privateKey: 'nope' } as never], '0.4.3')
const packed = JSON.stringify(plain)
assertNoSecretKeys(packed)
assert.equal(packed.includes('hunter2'), false)
assert.equal(packed.includes('s3cret-token'), false)
assert.equal(packed.includes('BEGIN OPENSSH'), false)
assert.equal(packed.includes('should-drop'), false)
assert.equal(packed.includes('"password"'), false)
assert.equal(plain.playbooks[0]?.steps[0]?.command?.includes('echo'), true)
assert.equal(plain.playbooks[0]?.varsDefaults?.find((v) => v.name === 'unit')?.defaultValue, 'sshd')
assert.equal(plain.playbooks[0]?.varsDefaults?.find((v) => v.name === 'token')?.defaultValue, undefined)
assert.deepEqual(plain.hostHints, [{ title: 'web-01', tags: ['prod'] }])

const sealed = await encodeSharePack(plain, 'correct horse')
const opened = await decodeSharePack(sealed, 'correct horse')
assert.equal(opened.encrypted, true)
assert.equal(opened.plain.playbooks[0]?.name, 'Restart')
let bad: unknown
try {
  await decodeSharePack(sealed, 'wrong')
} catch (err) {
  bad = err
}
assert.equal((bad as { code?: string }).code, 'bad-pass')
assert.equal(String((bad as Error).message).includes('Restart'), false)
let corrupt: unknown
try {
  await decodeSharePack('{', '')
} catch (err) {
  corrupt = err
}
assert.equal((corrupt as { code?: string }).code, 'bad-format')
let newer: unknown
try {
  await decodeSharePack(JSON.stringify({ magic: 'AISSPB', format: 'aiss-playbooks', version: 2, encrypted: false }), '')
} catch (err) {
  newer = err
}
assert.equal((newer as { code?: string }).code, 'need-newer')

const existing: Playbook[] = [{ ...book, id: 'old', name: 'Restart', description: '', steps: book.steps, updatedAt: 1 }]
assert.equal(previewShareImport(existing, plain.playbooks, 'skip', ' (imported)')[0]?.status, 'skip')
assert.equal(previewShareImport(existing, plain.playbooks, 'overwrite', ' (imported)')[0]?.status, 'overwrite')
assert.equal(previewShareImport(existing, plain.playbooks, 'duplicate', ' (imported)')[0]?.nextName, 'Restart (imported)')
const skipped = applyShareImport(existing, plain.playbooks, 'skip', ' (imported)', 50)
assert.equal(skipped.written, 0)
assert.equal(skipped.list.length, 1)
const copied = applyShareImport(existing, plain.playbooks, 'duplicate', ' (imported)', 50)
assert.equal(copied.written, 1)
assert.equal(copied.list[0]?.name, 'Restart (imported)')
const imported = JSON.stringify(copied.list[0])
assert.equal(imported.includes('hunter2'), false)
assert.equal(imported.includes('"password"'), false)
assert.equal(imported.includes('autoExec'), false)
assert.equal(imported.includes('BEGIN OPENSSH'), false)

const audit = mem()
setAuditEnabled(false, audit)
assert.equal(appendAudit({ type: 'command', host: 'web', outcome: 'allowed', detail: 'ls' }, audit), null)
appendGate({
  host: 'web',
  hostKey: 'p1',
  protection: 'readonly',
  gateRule: 'readonlyWrite',
  gateResult: 'blocked',
  summary: 'rm password=hunter2'
}, audit, 5_000)
assert.equal(loadGateEvents(audit).length, 1)
assert.equal(loadGateEvents(audit)[0]?.gateResult, 'blocked')
assert.equal(loadGateEvents(audit)[0]?.gateRule, 'readonlyWrite')
const alert = {
  id: 'al1',
  hostKey: 'p1',
  hostTitle: 'web',
  ruleId: 'cpu',
  value: 91,
  threshold: 90,
  at: 5_000,
  status: 'active' as const
}
const shown = viewTimeline(alert, [], loadAudit(audit), { now: 5_000 })
assert.equal(shown.some((e) => e.kind === 'gate' && e.gateResult === 'blocked'), true)
assert.equal(viewTimeline(alert, [], loadAudit(audit), { gates: false, now: 5_000 }).some((e) => e.kind === 'gate'), false)
clearAudit(audit)
assert.equal(loadGateEvents(audit).length, 1)
assert.equal(loadAudit(audit).some((e) => e.type === 'command'), false)
const csv = gateToCsv(loadGateEvents(audit))
assert.equal(csv.includes('hunter2'), false)
assert.equal(csv.includes('blocked'), true)

assert.equal(QUICK_STEPS, 3)
const fresh = decideQuickStart({ fresh: true, quickDone: false, hostCount: 0, whatsNewOpen: false })
assert.equal(fresh.show, true)
assert.equal(fresh.steps, 3)
assert.equal(fresh.resume, false)
assert.equal(decideQuickStart({ fresh: false, quickDone: false, hostCount: 0, whatsNewOpen: false }).show, false)
assert.equal(decideQuickStart({ fresh: true, quickDone: false, hostCount: 0, whatsNewOpen: true }).show, false)
assert.equal(decideQuickStart({ fresh: true, quickDone: false, hostCount: 1, whatsNewOpen: false }).resume, true)
assert.equal(decideQuickStart({ fresh: true, quickDone: true, hostCount: 0, whatsNewOpen: false }).show, false)
const upgrade = mem()
noteInstall(true, upgrade)
assert.equal(loadFreshProfile(upgrade), false)
const first = mem()
noteInstall(false, first)
assert.equal(loadFreshProfile(first), true)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const bootAt = app.indexOf('noteInstall(Boolean(last))')
assert.ok(bootAt > 0)
assert.equal(app.slice(bootAt, bootAt + 320).includes('setTourOpen'), false)
assert.ok(app.includes("'alert-rules'"))
assert.ok(app.includes("'playbook-import'"))
assert.ok(app.includes("'gate-timeline'"))
assert.ok(app.includes('QuickStartWizard'))
const wizard = readFileSync('src/renderer/src/components/QuickStartWizard.tsx', 'utf8')
assert.ok(wizard.includes('data-testid="ux60"'))
assert.ok(wizard.includes('data-testid="ux60-home"'))
const shareUi = readFileSync('src/renderer/src/components/PlaybookShare.tsx', 'utf8')
assert.equal(shareUi.includes('runPlaybook'), false)
assert.equal(shareUi.includes('.start('), false)
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.ok(css.includes('.ux60-card') && css.includes('pointer-events: none') && css.includes('white-space: nowrap'))
assert.ok(css.includes('.s2b-row') && css.includes('height: 32px'))

const castEvents: CastEvent[] = [
  { time: 0, type: 'o', data: 'hello' },
  { time: 10, type: 'o', data: ' mid' },
  { time: 40, type: 'o', data: ' tail' }
]
const before = castEvents.map((ev) => ({ ...ev }))
const clipped = clipCastEvents(castEvents, 8, 12)
assert.deepEqual(castEvents, before)
assert.equal(clipped.length, 1)
assert.equal(clipped[0]?.time, 2)
assert.equal(clipGifAllowed(0, 30), true)
assert.equal(clipGifAllowed(0, 31), false)
assert.equal(clampGifMax(1), 5)
assert.equal(clampGifMax(999), 120)
const md = clipMarkdown({ title: 'rec', start: 0, end: 10, events: castEvents, includeText: true })
assert.equal(md.includes('00:00.000'), true)
assert.equal(md.includes('hello'), true)
const quiet = clipMarkdown({ title: 'rec', start: 0, end: 10, events: castEvents, includeText: false })
assert.equal(quiet.includes('hello'), false)
assert.equal(quiet.includes('00:00.000'), true)
const gif = gifFromTextFrames(['hi', 'yo'])
assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a')
assert.equal(gif[gif.length - 1], 0x3b)
assert.equal(castEvents[1]?.time, 10)

assert.equal(hopVisual({ diagramIndex: 1, role: 'hop', structural: false, probing: false, probe: [{ hop: 1, ok: false, reason: 'timeout' }] }).visual, 'bad')
assert.equal(hopVisual({ diagramIndex: 1, role: 'hop', structural: false, probing: false, probe: [{ hop: 1, ok: false, reason: 'timeout' }] }).reason, 'timeout')
assert.equal(hopVisual({ diagramIndex: 2, role: 'target', structural: false, probing: false, probe: [{ hop: 2, ok: true, ms: 12 }] }).visual, 'ok')
assert.equal(hopVisual({ diagramIndex: 1, role: 'hop', structural: false, probing: true, probe: null }).visual, 'probing')
assert.equal(hopVisual({ diagramIndex: 1, role: 'hop', structural: false, probing: false, probe: null }).visual, 'unknown')
assert.equal(hopVisual({ diagramIndex: 1, role: 'hop', structural: true, probing: false, probe: [{ hop: 1, ok: true, ms: 4 }] }).visual, 'bad')

assert.equal(planAlertFix('a1', false, () => [{ command: 'df' }]).action, 'need-ai')
assert.equal(planAlertFix('a1', true, () => undefined).action, 'explain')
assert.equal(planAlertFix('a1', true, () => []).action, 'none')
assert.equal(planAlertFix('a1', true, () => [{ command: 'df' }]).action, 'draft')

const homeSrc = readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8')
assert.equal(homeSrc.includes('planAlertFix'), true)
assert.equal(homeSrc.includes('onFixPlaybook'), true)
const playerSrc = readFileSync('src/renderer/src/components/RecordingsTab.tsx', 'utf8')
const playerFn = playerSrc.slice(playerSrc.indexOf('export function RecordingPlayer'))
assert.equal(playerFn.includes('data-testid="l4c-gif"'), true)
assert.equal(playerFn.includes('data-testid="l4c-md"'), true)
assert.equal(playerFn.includes('recordings.write'), false)
assert.equal(playerFn.includes('recordings.delete'), false)
const jumpSrc = readFileSync('src/renderer/src/components/JumpChainEditor.tsx', 'utf8')
assert.equal(jumpSrc.includes('data-state='), true)
assert.equal(jumpSrc.includes('triangle-alert'), true)
const hopCss = readFileSync('src/renderer/src/styles-m2.css', 'utf8')
assert.equal(hopCss.includes('.jump-chip.is-bad'), true)
assert.equal(hopCss.includes('.jump-chip.is-ok'), true)
assert.equal(hopCss.includes('.jump-chip.is-probing'), true)
assert.equal(hopCss.includes('.jump-chip.is-unknown'), true)

console.log('v0.4.4 soft-start ok')
