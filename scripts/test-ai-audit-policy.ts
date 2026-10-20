import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { appendAudit, auditToCsv, auditToJsonl, filterAudit, loadAudit, auditPolicyText } from '../src/shared/audit-log'

const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }

const policies = [
  { chosen: 'suggest', effective: 'suggest', source: 'global', cappedBy: null, outcome: 'allowed', protection: 'normal', tab: 1 },
  { chosen: 'ask', effective: 'ask', source: 'host', cappedBy: null, outcome: 'allowed', protection: 'production', tab: 2 },
  { chosen: 'auto', effective: 'suggest', source: 'temp', cappedBy: 'readonly', outcome: 'blocked', protection: 'readonly', tab: 3 }
] as const
for (const p of policies) {
  appendAudit(
    {
      type: 'command', host: `h${p.tab}`, source: 'AI', outcome: p.outcome, detail: `uptime #${p.tab}`, protection: p.protection,
      tabNo: p.tab, policyChosen: p.chosen, policyEffective: p.effective, policySource: p.source, policyCappedBy: p.cappedBy
    },
    store
  )
}
const rows = loadAudit(store)
assert.equal(rows.length, 3)
const ro = rows.find((r) => r.tabNo === 3)!
assert.equal(ro.outcome, 'blocked')
assert.equal(ro.policyChosen, 'auto')
assert.equal(ro.policyEffective, 'suggest')
assert.equal(ro.policySource, 'temp')
assert.equal(ro.policyCappedBy, 'readonly')
assert.equal(ro.protection, 'readonly')
assert.equal(rows.find((r) => r.tabNo === 1)!.policyCappedBy, null)
assert.equal(auditPolicyText(ro), '#3 auto>suggest temp capped:readonly readonly')

// searchable
assert.equal(filterAudit(rows, { text: 'capped:readonly' }).length, 1)
assert.equal(filterAudit(rows, { text: '#2' }).length, 1)
assert.equal(filterAudit(rows, { text: 'ask>ask' }).length, 1)

// export
const csv = auditToCsv(rows)
const [head, ...lines] = csv.split('\n')
assert.equal(head, 'at,host,type,source,outcome,detail,tab,policy_chosen,policy_effective,policy_source,policy_capped_by,protection')
assert.ok(lines.some((l) => l.endsWith(',#3,auto,suggest,temp,readonly,readonly')))
const jsonl = auditToJsonl(rows).split('\n').map((l) => JSON.parse(l))
assert.ok(jsonl.some((o) => o.tabNo === 3 && o.policyCappedBy === 'readonly' && o.policySource === 'temp'))

// old rows without fields still export cleanly
const csvOld = auditToCsv([{ id: 'x', at: 0, type: 'connect', host: 'a', outcome: 'allowed', detail: 'd' }])
assert.ok(csvOld.split('\n')[1]!.endsWith(',d,,,,,,'))

// wiring: main emits audit for writes and read-only blocks; the AI panel records them
const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
assert.ok(/emitAudit\(oneLineCmd, 'allowed'\)/.test(agent), 'allowed write audited')
assert.equal((agent.match(/emitAudit\([^)]*'blocked', 'readonly'\)/g) || []).length, 3, 'read-only blocks audited (policy cap, legacy cap, main-process verdict)')
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes("ev.type === 'audit'") && panel.includes('tabNo: conversation?.n'))
console.log('test-ai-audit-policy: OK')

// compliance export (CSV/Markdown) carries the policy column
import('../src/shared/audit-export').then(({ renderAuditCompliance }) => {
  const copy = { title: 'T', redactNote: 'N', time: 'time', host: 'host', type: 'type', body: 'body', source: 'source', result: 'result', policy: 'policy', typeLabel: (t: string) => t }
  const out = renderAuditCompliance(rows, 'csv', copy)
  assert.ok(out.split('\n')[0]!.endsWith(',policy'))
  assert.ok(out.includes('#3 auto>suggest temp capped:readonly readonly'))
  console.log('test-ai-audit-policy export: OK')
})
