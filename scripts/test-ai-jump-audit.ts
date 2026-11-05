/** Round 7 / 2.3: jump to audit from ExecReplay, confirm dock, recent command — filtered. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filterAudit, appendAudit, loadAudit } from '../src/shared/audit-log'

const mem = new Map<string, string>()
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }

appendAudit({ type: 'command', host: 'web-01 #1', source: 'AI', outcome: 'allowed', detail: 'df -h' }, store)
appendAudit({ type: 'command', host: 'web-01 #1', source: 'AI', outcome: 'allowed', detail: 'uptime' }, store)
appendAudit({ type: 'command', host: 'other', source: 'user', outcome: 'allowed', detail: 'df -h' }, store)
const rows = loadAudit(store)
assert.equal(filterAudit(rows, { host: 'web-01 #1', source: 'AI', type: 'command' }).length, 2)
assert.equal(filterAudit(rows, { host: 'web-01 #1', text: 'uptime' }).length, 1)

const er = readFileSync('src/renderer/src/components/ExecReplay.tsx', 'utf8')
assert.ok(er.includes('OpenAuditDetail'))
assert.ok(er.includes("source: 'AI'"))
assert.ok(er.includes('exec.auditFilterTip'))
assert.ok(er.includes('host?: string'))

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.ok(app.includes('auditSource?:'))
assert.ok(app.includes('seedSource={t.auditSource}'))
assert.ok(app.includes('seedType={t.auditType}'))
assert.ok(app.includes('seedText={t.auditText}'))
assert.ok(app.includes('filters?.source'))
assert.ok(app.includes('onOpenAudit={(cmd)'))
assert.ok(app.includes('onOpenAudit={(it)'))

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes('data-testid="ai-pending-open-audit"'))
assert.ok(panel.includes('OPEN_AUDIT_EVENT'))
assert.ok(panel.includes('command={s.command}'))

const alp = readFileSync('src/renderer/src/components/AuditLogPanel.tsx', 'utf8')
assert.ok(alp.includes('seedSource'))
assert.ok(alp.includes('seedType'))
assert.ok(alp.includes('seedText'))
assert.ok(alp.includes('if (seedSource !== undefined) setSource(seedSource)'))

const ci = readFileSync('src/renderer/src/components/CommandInput.tsx', 'utf8')
assert.ok(ci.includes('data-testid="suggest-open-audit"'))
assert.ok(ci.includes('onOpenAudit'))

const qp = readFileSync('src/renderer/src/components/QuickPick.tsx', 'utf8')
assert.ok(qp.includes('data-testid="qp-open-audit"'))

const scb = readFileSync('src/renderer/src/components/SessionCommandBar.tsx', 'utf8')
assert.ok(scb.includes('onOpenAudit={onOpenAudit}'))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['exec.auditFilterTip', 'exec.openHostAudit', 'exec.openHostAuditTip', 'exec.recentAudit', 'exec.recentAuditTip']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}

console.log('test-ai-jump-audit: OK')
