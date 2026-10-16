/** Polish-8: agent safety tiers. Package is 0.4.9. No win.fileVersion. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import { commandAutoRunAllowed } from '../src/shared/ai-reply-cards'
import {
  createInFlightBook,
  decideSafetyGate,
  effectiveSafetyTier,
  planCommandConfirm,
  safetyTierEngaged
} from '../src/shared/safety-tier'
import { translate } from '../src/renderer/src/lib/i18n'
import type { AiChatPayload, AiSettings, AiStreamEvent } from '../src/shared/ipc'
import { resolveAiConfirmStep, runOpenClawCoreAgentChat } from '../src/main/ai-interactive-agent'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.4.13')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal(pkg.scripts.test.includes('scripts/test-polish-8.ts'), true)
assert.equal(tipSuggest, '0.4.13-polish12')
assert.equal(rollback, '0.4.12-polish11')
assert.equal(rawPkg.includes(tipSuggest), false)
assert.equal(rawPkg.includes(rollback), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.8'))
const published48 = changelog.slice(changelog.indexOf('## v0.4.8'), changelog.indexOf('## v0.4.7'))
const published47 = changelog.slice(changelog.indexOf('## v0.4.7'), changelog.indexOf('## v0.4.6'))
const published46 = changelog.slice(changelog.indexOf('## v0.4.6'), changelog.indexOf('## v0.4.5'))
assert.equal(unreleased.replace('## Unreleased', '').trim().startsWith('## v0.4.13'), true)
assert.ok(unreleased.includes('v0.4.9 soft-start'))
assert.ok(unreleased.includes('Polish-8'))
assert.ok(unreleased.includes('Public HOLD'))
assert.ok(unreleased.includes('不打 tag'))
assert.ok(unreleased.includes('No tag'))
assert.ok(unreleased.includes('No GitHub Release'))
assert.ok(unreleased.includes('fileVersion'))
assert.ok(unreleased.includes('0.4.9-polish8'))
assert.ok(unreleased.includes('0.4.8-polish7'))
assert.ok(unreleased.includes('标签不压缩'))
assert.ok(unreleased.includes('横向滚动'))
assert.ok(unreleased.includes('布局开关回到标题栏'))
assert.ok(unreleased.includes('1366×768 标题栏仍是一行'))
assert.equal(published48.includes('标签不压缩'), false)
assert.ok(published48.includes('v0.4.8 soft-start'))
assert.ok(published48.includes('Polish-7'))
assert.ok(published48.includes('0.4.8-polish7'))
assert.ok(published48.includes('0.4.8-polish6'))
assert.equal(published48.includes('Polish-8'), false)
assert.ok(published47.includes('Polish-6'))
assert.ok(published47.includes('0.4.8-polish6'))
assert.ok(published46.includes('Polish-5'))
assert.equal(published46.includes('Polish-8'), false)
assert.ok(changelogFor('0.4.9').length >= 4)
assert.ok(changelogFor('0.4.8').some((entry) => entry.action === 'openAi'))

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(toolbar.includes('className="app-toolbar-layout"'))
assert.ok(toolbar.includes('LayoutToggleIcon'))
assert.ok(toolbar.includes('data-testid={`layout-toggle-${item.kind}`}'))
for (const kind of ['sidebar', 'main', 'ai']) {
  assert.ok(toolbar.includes(`kind: '${kind}'`), kind)
}
for (const id of ['toggleSidebar', 'toggleMain', 'toggleAi']) {
  assert.ok(toolbar.includes(`id: '${id}'`), id)
}
assert.ok(toolbar.includes('onMenuAction(item.id)'))
assert.ok(toolbar.includes("toggles?.toggleSidebar ?? true"))
assert.ok(toolbar.includes("toggles?.toggleAi ?? false"))
assert.match(styles, /button\.layout-toggle-btn\s*\{[^}]*width:\s*32px/)
assert.match(styles, /button\.layout-toggle-btn\s*\{[^}]*border:\s*none/)
assert.match(styles, /\.app-toolbar-layout\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.app-titlebar\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.tab-bar-scroll > \.tab\s*\{[^}]*flex:\s*0\s*0\s*auto/)

assert.equal(commandAutoRunAllowed('low'), false)
assert.equal(commandAutoRunAllowed('high'), false)
assert.equal(zh('safety.confirm'), '确认')
assert.equal(en('safety.confirm'), 'Confirm')
assert.equal(zh('safety.observe'), '观察')
assert.equal(en('safety.autopilot'), 'Autopilot')
assert.ok(zh('safety.hint').includes('高风险'))
assert.ok(en('safety.inflight').toLowerCase().includes('agree'))

const settingsUi = readFileSync('src/renderer/src/components/SafetyTierSettings.tsx', 'utf8')
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(settingsUi.includes('data-testid="safety-tier"'))
assert.ok(panel.includes('data-testid="safety-scope"'))
assert.ok(panel.includes('confirmStep(l.requestId!, true)'))
assert.ok(panel.includes('confirmStep(l.requestId!, false)'))

assert.equal(safetyTierEngaged({}), false)
assert.equal(safetyTierEngaged({ safetyTier: 'confirm' }), true)
assert.equal(effectiveSafetyTier({ safetyTier: 'observe' }), 'observe')
assert.equal(
  effectiveSafetyTier(
    { safetyTier: 'confirm', safetyTierHosts: { h1: 'trusted' }, safetyTierSessions: { s1: 'observe' } },
    { hostId: 'h1', sessionId: 's1' }
  ),
  'observe'
)
assert.equal(
  effectiveSafetyTier({ safetyTier: 'confirm', safetyTierHosts: { h1: 'trusted' } }, { hostId: 'h1' }),
  'trusted'
)

function gate(partial: Parameters<typeof decideSafetyGate>[0]) {
  return decideSafetyGate(partial)
}

assert.equal(gate({ tier: 'confirm', command: 'df -h', riskLevel: 'low' }).mode, 'auto')
assert.equal(gate({ tier: 'observe', command: 'df -h', riskLevel: 'low' }).mode, 'auto')
assert.equal(gate({ tier: 'confirm', command: 'systemctl restart nginx', riskLevel: 'medium' }).mode, 'agree')
assert.equal(gate({ tier: 'confirm', command: 'systemctl restart nginx', riskLevel: 'low' }).mode, 'agree')
assert.equal(gate({ tier: 'trusted', command: 'systemctl restart nginx', riskLevel: 'medium' }).mode, 'auto')
assert.equal(gate({ tier: 'observe', command: 'rm /tmp/a', riskLevel: 'medium' }).mode, 'suggest')
assert.equal(gate({ tier: 'observe', command: 'rm /tmp/a', riskLevel: 'medium' }).offerAgree, false)
assert.equal(gate({ tier: 'confirm', command: 'reboot', riskLevel: 'low' }).mode, 'strong')
assert.equal(gate({ tier: 'confirm', command: 'reboot', riskLevel: 'high' }).write, false)
assert.equal(gate({ tier: 'trusted', command: 'reboot', riskLevel: 'high' }).mode, 'agree')
assert.equal(gate({ tier: 'autopilot', command: 'reboot', riskLevel: 'high' }).mode, 'agree')
assert.equal(gate({ tier: 'autopilot', command: 'reboot', riskLevel: 'high' }).write, false)
assert.equal(
  gate({ tier: 'autopilot', command: 'reboot', riskLevel: 'high', allowHighRisk: true, production: false }).mode,
  'auto'
)
assert.equal(
  gate({
    tier: 'autopilot',
    command: 'reboot',
    riskLevel: 'high',
    allowHighRisk: true,
    production: true,
    allowHosts: ['prod-1'],
    hostId: 'prod-1'
  }).write,
  false
)
assert.equal(
  gate({ tier: 'autopilot', command: 'systemctl restart nginx', riskLevel: 'medium', production: true }).mode,
  'agree'
)
assert.equal(
  gate({ tier: 'autopilot', command: 'systemctl restart nginx', riskLevel: 'medium', production: true }).warn,
  true
)
assert.equal(
  gate({
    tier: 'autopilot',
    command: 'systemctl restart nginx',
    riskLevel: 'medium',
    production: true,
    allowHosts: ['prod-1'],
    hostId: 'prod-1'
  }).mode,
  'auto'
)
assert.equal(gate({ tier: 'trusted', command: 'top', riskLevel: 'low' }).mode, 'agree')
assert.equal(gate({ tier: 'autopilot', command: 'vim /etc/hosts', riskLevel: 'low' }).write, false)
assert.equal(gate({ tier: 'confirm', command: 'less /var/log/syslog', riskLevel: 'low' }).alternative, 'tail -n 80')
assert.equal(gate({ tier: 'confirm', command: 'df -h', riskLevel: 'medium' }).kind, 'read')
assert.equal(gate({ tier: 'confirm', command: 'df -h', riskLevel: 'high' }).mode, 'strong')

const book = createInFlightBook()
const firstTop = planCommandConfirm({ tier: 'confirm', command: 'top', riskLevel: 'low', book })
assert.equal(firstTop.mode, 'agree')
assert.equal(firstTop.waitForAgree, true)
assert.equal(firstTop.write, false)
book.note('top')
const secondTop = planCommandConfirm({ tier: 'trusted', command: 'top', riskLevel: 'low', book })
assert.equal(secondTop.mode, 'hold')
assert.equal(secondTop.waitForAgree, false)
assert.equal(secondTop.offerAgree, false)
assert.equal(secondTop.write, false)
const spaced = planCommandConfirm({ tier: 'autopilot', command: 'top  ', riskLevel: 'high', book, allowHighRisk: true })
assert.equal(spaced.mode, 'hold')
book.release('top')
assert.equal(planCommandConfirm({ tier: 'confirm', command: 'top', riskLevel: 'low', book }).mode, 'agree')

type DriveOpts = {
  id: string
  replies: Array<Record<string, unknown>>
  settings: Partial<AiSettings>
  safetyContext?: AiChatPayload['safetyContext']
  approve?: boolean
}

async function drive(opts: DriveOpts): Promise<{ events: AiStreamEvent[]; writes: string[] }> {
  const events: AiStreamEvent[] = []
  const writes: string[] = []
  const replies = opts.replies.map((step) => JSON.stringify(step))
  const settings = {
    providers: [
      {
        id: 'eval',
        name: 'eval',
        baseURL: 'http://127.0.0.1:9/v1',
        apiKey: 'eval-key',
        modelList: ['eval-model']
      }
    ],
    activeProviderId: 'eval',
    model: 'eval-model',
    temperature: 0,
    sshParseInstructions: '',
    useOpenClaw: true,
    autoApproveLowRisk: false,
    ...opts.settings
  } as AiSettings
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    const next = replies.shift()
    if (!next) throw new Error(`${opts.id}: scripted model ran out of replies`)
    return new Response(JSON.stringify({ choices: [{ message: { content: next } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch
  const ssh = {
    getRingSnapshot: () => 'ok\n',
    write: (_sessionId: string, data: string) => {
      writes.push(data)
      return true
    },
    confirmedCommandOutcome: () => null
  }
  const wc = {
    isDestroyed: () => false,
    send: (_channel: string, ev: AiStreamEvent) => {
      events.push(ev)
      if (ev.type === 'step' && ev.requestId) {
        const before = writes.length
        assert.equal(before, writes.length)
        queueMicrotask(() => {
          assert.equal(writes.length, before, `${opts.id}: wrote before Agree`)
          resolveAiConfirmStep(ev.requestId!, opts.approve !== false)
        })
      }
    }
  }
  try {
    await runOpenClawCoreAgentChat(
      wc as never,
      settings,
      {
        messages: [{ role: 'user', content: `please ${opts.id}` }],
        targetSessionId: `polish8-${opts.id}`,
        historyKey: `polish8-${opts.id}`,
        terminalExcerpt: 'ready',
        safetyContext: opts.safetyContext
      },
      ssh as never
    )
  } finally {
    globalThis.fetch = previousFetch
  }
  return { events, writes }
}

function stepEvents(events: AiStreamEvent[]) {
  return events.filter((ev) => ev.type === 'step')
}

const previousSettle = process.env.AISS_COMMAND_SETTLE_MS
const previousPoll = process.env.AISS_POLL_WAIT_MS
const previousConfirm = process.env.AISS_CONFIRM_TIMEOUT_MS
process.env.AISS_COMMAND_SETTLE_MS = '200'
process.env.AISS_POLL_WAIT_MS = '0'
process.env.AISS_CONFIRM_TIMEOUT_MS = '1500'

const end = { description: 'done', action: 'end', completed: true, riskLevel: 'low', notes: '' }

try {
  const readOnly = await drive({
    id: 'df',
    settings: { safetyTier: 'confirm' },
    replies: [
      { description: 'disk', action: 'command', command: 'df -h', riskLevel: 'low', notes: '' },
      end
    ]
  })
  const dfSteps = stepEvents(readOnly.events)
  assert.equal(dfSteps[0] && dfSteps[0].type === 'step' ? dfSteps[0].safetyMode : '', 'auto')
  assert.equal(dfSteps[0] && dfSteps[0].type === 'step' ? dfSteps[0].requestId : 'x', undefined)
  assert.equal(dfSteps[0] && dfSteps[0].type === 'step' ? dfSteps[0].structured.riskLevel : '', 'low')
  assert.deepEqual(readOnly.writes, ['df -h\n'])
  assert.equal(readOnly.events.some((ev) => ev.type === 'error'), false)

  const legacy = await drive({
    id: 'legacy-df',
    settings: {},
    replies: [
      { description: 'disk', action: 'command', command: 'df -h', riskLevel: 'low', notes: '' },
      end
    ]
  })
  const legacyStep = stepEvents(legacy.events)[0]
  assert.equal(legacyStep && legacyStep.type === 'step' ? legacyStep.safetyMode : 'x', undefined)
  assert.ok(legacyStep && legacyStep.type === 'step' && legacyStep.requestId)
  assert.notEqual(legacyStep && legacyStep.type === 'step' ? legacyStep.autoApproved : true, true)
  assert.deepEqual(legacy.writes, ['df -h\n'])

  const high = await drive({
    id: 'reboot',
    settings: { safetyTier: 'confirm' },
    replies: [
      { description: 'reboot', action: 'command', command: 'reboot', riskLevel: 'high', notes: '' },
      end
    ]
  })
  const rebootStep = stepEvents(high.events)[0]
  assert.equal(rebootStep && rebootStep.type === 'step' ? rebootStep.safetyMode : '', 'strong')
  assert.ok(rebootStep && rebootStep.type === 'step' && rebootStep.requestId)
  assert.deepEqual(high.writes, ['reboot\n'])

  const denied = await drive({
    id: 'reboot-deny',
    settings: { safetyTier: 'autopilot', autopilotAllowHighRisk: true },
    safetyContext: { production: true, hostId: 'prod-1' },
    approve: false,
    replies: [
      { description: 'reboot', action: 'command', command: 'reboot', riskLevel: 'high', notes: '' }
    ]
  })
  const deniedStep = stepEvents(denied.events)[0]
  assert.equal(deniedStep && deniedStep.type === 'step' ? deniedStep.safetyMode : '', 'strong')
  assert.deepEqual(denied.writes, [])

  const observe = await drive({
    id: 'observe-rm',
    settings: { safetyTier: 'observe' },
    replies: [
      { description: 'delete', action: 'command', command: 'rm /tmp/a', riskLevel: 'medium', notes: '' },
      end
    ]
  })
  const rmStep = stepEvents(observe.events)[0]
  assert.equal(rmStep && rmStep.type === 'step' ? rmStep.safetyMode : '', 'suggest')
  assert.equal(rmStep && rmStep.type === 'step' ? rmStep.requestId : 'x', undefined)
  assert.deepEqual(observe.writes, [])

  const interactive = await drive({
    id: 'top',
    settings: { safetyTier: 'confirm' },
    replies: [
      { description: 'watch', action: 'command', command: 'top', riskLevel: 'low', notes: '' },
      { description: 'watch again', action: 'command', command: 'top', riskLevel: 'low', notes: '' },
      end
    ]
  })
  const topSteps = stepEvents(interactive.events).filter(
    (ev) => ev.type === 'step' && ev.structured.action === 'command'
  )
  assert.equal(topSteps.length, 2)
  assert.equal(topSteps[0] && topSteps[0].type === 'step' ? topSteps[0].safetyMode : '', 'agree')
  assert.ok(topSteps[0] && topSteps[0].type === 'step' && topSteps[0].requestId)
  assert.equal(topSteps[1] && topSteps[1].type === 'step' ? topSteps[1].safetyMode : '', 'hold')
  assert.equal(topSteps[1] && topSteps[1].type === 'step' ? topSteps[1].requestId : 'x', undefined)
  assert.deepEqual(interactive.writes, ['top\n'])
  assert.equal(interactive.events.some((ev) => ev.type === 'error'), false)
} finally {
  if (previousSettle == null) delete process.env.AISS_COMMAND_SETTLE_MS
  else process.env.AISS_COMMAND_SETTLE_MS = previousSettle
  if (previousPoll == null) delete process.env.AISS_POLL_WAIT_MS
  else process.env.AISS_POLL_WAIT_MS = previousPoll
  if (previousConfirm == null) delete process.env.AISS_CONFIRM_TIMEOUT_MS
  else process.env.AISS_CONFIRM_TIMEOUT_MS = previousConfirm
}

console.log('test-polish-8 ok')
