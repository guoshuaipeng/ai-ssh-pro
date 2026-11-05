import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { appendAudit, filterAudit, loadAudit, auditPolicyText } from '../src/shared/audit-log'

const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }

const samples = [
  { chosen: 'suggest' as const, effective: 'suggest' as const, source: 'global' as const, cappedBy: null, outcome: 'allowed' as const, protection: 'normal' as const, tab: 1, cmd: 'df -h' },
  { chosen: 'ask' as const, effective: 'ask' as const, source: 'host' as const, cappedBy: null, outcome: 'allowed' as const, protection: 'production' as const, tab: 2, cmd: 'systemctl restart nginx' },
  { chosen: 'auto' as const, effective: 'suggest' as const, source: 'temp' as const, cappedBy: 'readonly' as const, outcome: 'blocked' as const, protection: 'readonly' as const, tab: 3, cmd: 'rm -rf /tmp/x' },
  { chosen: 'auto' as const, effective: 'auto' as const, source: 'global' as const, cappedBy: null, outcome: 'cancelled' as const, protection: 'normal' as const, tab: 4, cmd: 'apt upgrade' }
]
for (const p of samples) {
  appendAudit(
    {
      type: 'command',
      host: `host-${p.tab}`,
      source: 'AI',
      outcome: p.outcome,
      detail: p.cmd,
      protection: p.protection,
      tabNo: p.tab,
      policyChosen: p.chosen,
      policyEffective: p.effective,
      policySource: p.source,
      policyCappedBy: p.cappedBy
    },
    store
  )
}
appendAudit({ type: 'connect', host: 'user-host', source: 'user', outcome: 'allowed', detail: 'ssh' }, store)

const rows = loadAudit(store)
assert.equal(filterAudit(rows, { source: 'AI' }).length, 4)
assert.equal(filterAudit(rows, { source: 'user' }).length, 1)
assert.equal(filterAudit(rows, { type: 'command', source: 'AI' }).length, 4)
assert.equal(filterAudit(rows, { text: '#3' }).length, 1)
assert.equal(filterAudit(rows, { text: 'capped:readonly' }).length, 1)
assert.ok(auditPolicyText(rows.find((r) => r.tabNo === 3)!).includes('auto>suggest'))

const panel = readFileSync('src/renderer/src/components/AuditLogPanel.tsx', 'utf8')
assert.ok(panel.includes('testId="audit-source"'), 'source filter')
assert.ok(panel.includes("value: 'command'"), 'command type filter')
assert.ok(panel.includes("value: 'gate'"), 'gate type filter')
assert.ok(panel.includes("value: 'ai.action'"), 'ai.action type filter')
assert.ok(panel.includes('au2.colPolicy') && panel.includes('au2.colTab') && panel.includes('au2.colSource'))
assert.ok(panel.includes('data-testid="audit-row-policy"'))
assert.ok(panel.includes('data-testid="audit-row-tab"'))
assert.ok(panel.includes('data-testid="audit-row-outcome"'))
assert.ok(panel.includes('au2.out.${out}') || panel.includes("au2.out.${out}") || panel.includes('`au2.out.${out}`'))
assert.ok(panel.includes("filterAudit(events, { host, type, source, text"))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['au2.source', 'au2.colPolicy', 'au2.out.blocked', 'au2.srcTemp', 'au2.capped']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}

const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.ok(css.includes('.au2-outcome.is-blocked'))
assert.ok(css.includes('td.au2-policy'))

console.log('test-ai-audit-ui: OK')
