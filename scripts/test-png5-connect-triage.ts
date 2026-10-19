/** PNG-5: SSH connect failure is one triage card, not a bare IPC error. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  acceptPrimaryAction,
  connectionTechnicalDetail,
  jumpTroubleDetail,
  orderedActions,
  primaryAction,
  showConnectionTrouble,
  troubleshootConnection,
  type TroubleId
} from '../src/shared/connect-trouble'
import { classifyHopReason } from '../src/shared/jump-chain'
import { isEngineerLeak } from '../src/shared/product-error'
import { disconnectStatusSentence } from '../src/shared/status-bar'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.40')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-png5-connect-triage/)

const ipc = "Error invoking remote method 'ssh:connect': Error: connect ECONNREFUSED 10.0.0.1:22"
const refused = troubleshootConnection(ipc)
assert.equal(refused.id, 'refused')
assert.deepEqual(refused.steps, ['host', 'port', 'net', 'retry'])
assert.ok(refused.actions.length >= 1 && refused.actions.length <= 3)
assert.deepEqual(orderedActions(refused), ['edit', 'retry'])
assert.equal(primaryAction(refused), 'edit')
assert.equal(connectionTechnicalDetail(ipc), 'connect ECONNREFUSED 10.0.0.1:22')
assert.equal(connectionTechnicalDetail(ipc).includes("Error invoking remote method"), false)

const auth = troubleshootConnection('All configured authentication methods failed')
assert.equal(auth.id, 'auth')
assert.deepEqual(orderedActions(auth), ['keys', 'edit', 'retry'])
assert.equal(primaryAction(auth), 'keys')

const timeout = troubleshootConnection('connect ETIMEDOUT 10.0.0.8:22')
assert.equal(timeout.id, 'timeout')
assert.equal(timeout.primary, 'retry')
assert.deepEqual(orderedActions(timeout), ['retry', 'edit'])

const unreachable = troubleshootConnection('connect EHOSTUNREACH 10.0.0.9:22')
assert.equal(unreachable.id, 'unreachable')
assert.notEqual(unreachable.id, timeout.id)
assert.deepEqual(orderedActions(unreachable), ['edit', 'retry'])

assert.equal(troubleshootConnection('getaddrinfo ENOTFOUND missing.example').id, 'dns')
assert.equal(troubleshootConnection('[hop 2/3] bastion (10.0.0.2): refused').id, 'jump')
const jumpAuth = troubleshootConnection('[hop 1/2] bastion (10.0.0.2): All configured authentication methods failed')
assert.equal(jumpAuth.id, 'jump')
assert.deepEqual(orderedActions(jumpAuth), ['keys', 'edit', 'retry'])
assert.equal(primaryAction(jumpAuth), 'keys')
const jumpTimeout = troubleshootConnection('[hop 2/3] edge (10.0.0.3): connect ETIMEDOUT')
assert.equal(jumpTimeout.primary, 'retry')
assert.equal(classifyHopReason('refused'), 'refused')
assert.equal(classifyHopReason('All configured authentication methods failed'), 'auth')
assert.equal(classifyHopReason('ETIMEDOUT'), 'timeout')
assert.equal(classifyHopReason('EHOSTUNREACH'), 'unreachable')
const jd = jumpTroubleDetail('[hop 2/3] bastion (10.0.0.2): Connection refused')
assert.ok(jd)
assert.equal(jd?.reasonKind, 'refused')
assert.equal(jd?.hop, 2)
assert.equal(jd?.name, 'bastion')
assert.match(zh('png5.cause.jump.auth', { hop: 1, total: 2, name: 'bastion' }), /bastion/)
assert.match(en('png5.cause.jump.timeout', { hop: 2, total: 3, name: 'edge' }), /edge/)
assert.equal(isEngineerLeak(zh('png5.cause.jump.refused', { hop: 1, total: 1, name: 'j' })), false)
assert.equal(troubleshootConnection('No route to host').id, 'unreachable')
assert.equal(troubleshootConnection('handshake timed out').id, 'timeout')
assert.equal(showConnectionTrouble('import', '无法解析该文件'), false)
assert.equal(showConnectionTrouble('permission', 'EACCES /tmp/x'), false)
assert.equal(showConnectionTrouble('unreachable', 'ECONNREFUSED'), true)
assert.equal(showConnectionTrouble('auth', 'All configured authentication methods failed'), true)
assert.equal(showConnectionTrouble('generic', 'EHOSTUNREACH 10.0.0.9'), true)

const classes = ['auth', 'timeout', 'unreachable'] as const
for (const locale of ['zh-CN', 'en'] as const) {
  const lines = classes.map((id) => translate(locale, `png5.cause.${id}`))
  assert.equal(new Set(lines).size, 3, `${locale} primary causes stay distinct`)
  for (const line of lines) {
    assert.equal(isEngineerLeak(line), false)
    assert.equal(/Error invoking remote method|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|at \w+\(/.test(line), false)
  }
}

const causeIds: TroubleId[] = ['refused', 'timeout', 'dns', 'auth', 'jump', 'dropped', 'unreachable', 'generic']
for (const id of causeIds) {
  const item = troubleshootConnection(
    id === 'refused' ? ipc
      : id === 'timeout' ? 'ETIMEDOUT'
        : id === 'dns' ? 'ENOTFOUND missing.example'
          : id === 'auth' ? 'authentication methods failed'
            : id === 'jump' ? '[hop 1/2] bastion (10.0.0.2): refused'
              : id === 'dropped' ? 'connection closed'
                : id === 'unreachable' ? 'EHOSTUNREACH'
                  : 'something else went wrong'
  )
  assert.equal(item.id, id === 'generic' ? 'generic' : id)
  const actions = orderedActions(item)
  assert.ok(actions.length >= 1 && actions.length <= 3)
  assert.ok(actions.every((action) => action === 'edit' || action === 'keys' || action === 'retry'))
  const line = zh(`png5.cause.${item.id}`)
  const english = en(`png5.cause.${item.id}`)
  assert.equal(isEngineerLeak(line), false)
  assert.equal(isEngineerLeak(english), false)
  assert.ok(line.length > 0 && english.length > 0)
  assert.notEqual(line, connectionTechnicalDetail(ipc))
}

assert.equal(zh('png5.cause.dropped'), disconnectStatusSentence('', 'zh-CN'))
assert.equal(en('png5.cause.dropped'), disconnectStatusSentence('', 'en'))
assert.equal(zh('png5.details'), '详情 ▾')
assert.equal(en('png5.details'), 'Details ▾')
assert.equal(zh('png5.action.keys'), '打开密钥或凭据')
assert.equal(en('png5.action.keys'), 'Open key or credential')
assert.equal(isEngineerLeak(zh('pf5.editConn')), false)
assert.equal(isEngineerLeak(zh('pf5.retry')), false)
assert.equal(acceptPrimaryAction(false), true)
assert.equal(acceptPrimaryAction(true), false)

const card = readFileSync('src/renderer/src/components/ConnectTrouble.tsx', 'utf8')
const causeAt = card.indexOf('data-testid="png5-cause"')
const actionsAt = card.indexOf('connect-trouble-actions')
const detailsAt = card.indexOf('data-testid="png5-details"')
assert.ok(causeAt > 0 && actionsAt > causeAt && detailsAt > actionsAt, 'cause, then actions, then details')
assert.equal(card.includes('connect-trouble-steps'), false)
assert.match(card, /disconnectStatusSentence\(host, loc\)/)
assert.match(card, /jumpTroubleDetail\(raw\)/)
assert.match(card, /png5\.cause\.jump\./)
assert.match(card, /data-hop-kind/)
assert.match(card, /acceptPrimaryAction\(busy\)/)
assert.match(card, /disabled=\{isPrimary && busy\}/)
assert.match(card, /aria-busy=\{isPrimary && busy \? true : undefined\}/)
assert.match(card, /lock\.current/)
const detailsTag = card.slice(card.lastIndexOf('<details'), detailsAt)
assert.equal(detailsTag.includes('open'), false, 'details stay closed until the user opens them')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.equal(app.split('<ConnectTrouble').length - 1, 1)
assert.match(app, /failureCard \?\?/)
assert.match(app, /failureHoldRef/)
assert.equal(app.includes('connect-trouble-steps'), false)
assert.doesNotMatch(app, /<ConnectTrouble raw=\{errorRaw\} \/>/)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.equal(toolbar.includes('png5'), false)
assert.equal(toolbar.includes('className="primary"'), false)

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(css, /\.connect-trouble\s*\{[^}]*min-width:\s*0/)
assert.match(css, /\.connect-trouble\s*\{[^}]*max-width:\s*100%/)
assert.match(css, /\.connect-trouble\s*\{[^}]*overflow:\s*hidden/)
assert.match(css, /\.sidebar \.connect-trouble-actions\s*\{[^}]*flex-direction:\s*column/)
assert.match(css, /\.connect-trouble-details pre\s*\{[^}]*max-height:\s*96px/)
assert.match(css, /@media \(max-width:\s*1366px\)\s*\{[^}]*\.connect-trouble\s*\{[^}]*overflow:\s*hidden/)
assert.equal(css.includes('connect-trouble-steps'), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
assert.match(unreleased, /连接失败短分诊（PNG-5）/)
assert.match(unreleased, /Public HOLD/)
assert.match(unreleased, /0\.4\.4/)
assert.match(unreleased, /详情 ▾/)

console.log('test-png5-connect-triage ok')
