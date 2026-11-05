/** H02: policy「仅建议」— non-read commands never SSH-write; UI is suggest/copy/fill only. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { policyTier, resolveAiPolicy } from '../src/shared/ai-policy'
import { planCommandConfirm } from '../src/shared/safety-tier'

const gate = (command: string, riskLevel: string | null = 'medium') =>
  planCommandConfirm({
    tier: policyTier('suggest'),
    command,
    riskLevel,
    allowHosts: [],
    production: false
  })

// restart / write / high / interactive → suggest, no write, no Agree
for (const [cmd, risk] of [
  ['systemctl restart php-fpm', 'medium'],
  ['rm -rf /var/cache/*', 'high'],
  ['reboot', 'high'],
  ['top', 'low'],
  ['vim /etc/nginx/nginx.conf', 'medium']
] as const) {
  const d = gate(cmd, risk)
  assert.equal(d.mode, 'suggest', `${cmd} mode`)
  assert.equal(d.write, false, `${cmd} write`)
  assert.equal(d.offerAgree, false, `${cmd} offerAgree`)
  assert.equal(d.waitForAgree, false, `${cmd} waitForAgree`)
}

// read-only still auto under 仅建议
const df = gate('df -h', 'low')
assert.equal(df.mode, 'auto')
assert.equal(df.write, true)
assert.equal(df.kind, 'read')

// effective policy resolve
const r = resolveAiPolicy({ settings: { aiPolicy: 'suggest' } })
assert.equal(r.effective, 'suggest')
assert.equal(policyTier(r.effective), 'observe')

// agent still skips write on suggest/hold
const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8').replace(/\r\n/g, '\n')
assert.ok(agent.includes("if (safetyMode === 'suggest' || safetyMode === 'hold') skipCommandWrite = true"))
assert.ok(agent.includes('当前安全档只建议这条命令，未写入终端') || agent.includes('only suggested this command'))

// UI: suggest branch never Agree; copy/fill present
const bar = readFileSync('src/renderer/src/components/SafetyCommandBar.tsx', 'utf8').replace(/\r\n/g, '\n')
assert.ok(bar.includes("data-testid=\"safety-suggest\""))
assert.ok(bar.includes("data-testid=\"safety-suggest-copy\""))
assert.ok(bar.includes("data-testid=\"safety-suggest-fill\""))
assert.ok(bar.includes("if (mode === 'suggest')"))
const suggestBlock = bar.slice(bar.indexOf("if (mode === 'suggest')"), bar.indexOf("if (mode === 'hold'"))
assert.equal(/onAgree\(/.test(suggestBlock), false, 'suggest UI must not call onAgree')
assert.equal(/ai-btn-agree/.test(suggestBlock), false, 'suggest UI must not render Agree')

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8').replace(/\r\n/g, '\n')
assert.ok(panel.includes('onCopy={(cmd) => copyText(cmd)}'))
assert.ok(panel.includes('onFill='))
assert.ok(panel.includes("tg('d15.filled')"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'safety.suggest': '仅建议 · 未写入终端'"))
assert.ok(i18n.includes("'safety.suggestCopy': '复制命令'"))
assert.ok(i18n.includes("'safety.suggestFill': '填入命令栏'"))
assert.equal(i18n.split("'safety.suggestCopy':").length - 1, 2)
assert.equal(i18n.split("'safety.suggestFill':").length - 1, 2)

console.log('test-h02-suggest-only: ok')
