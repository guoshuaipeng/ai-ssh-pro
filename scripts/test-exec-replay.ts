import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execStatusFrom, formatExecDuration, normalizeExecRecord, summarizeExecOutput, SUMMARY_MAX_LINES } from '../src/shared/ai-exec-replay'
import { normalizeAiChatHistory, serializeAiChatHistory } from '../src/shared/ai-chat-history'

// summary: output after the last echo of the command, without the trailing prompt
{
  const snap = 'ops@web-01:~$ uptime\n 14:12:41 up 3 days,  load average: 0.10, 0.20, 0.30\nops@web-01:~$ df -h /\nFilesystem  Size Used Avail Use% Mounted on\n/dev/vda1    40G  35G  5G  87% /\nops@web-01:~$ '
  const r = summarizeExecOutput(snap, 'df -h /')
  assert.equal(r.outputLines, 2)
  assert.equal(r.summary, 'Filesystem  Size Used Avail Use% Mounted on\n/dev/vda1    40G  35G  5G  87% /')
}
// ANSI stripped, tail capped, secrets redacted
{
  const body = Array.from({ length: 20 }, (_, i) => `\x1b[32mline ${i + 1}\x1b[0m`).join('\r\n')
  const r = summarizeExecOutput(`$ seq\r\n${body}\r\nroot@h:/# `, 'seq')
  assert.equal(r.outputLines, 20)
  assert.equal(r.summary.split('\n').length, SUMMARY_MAX_LINES)
  assert.ok(r.summary.startsWith('line 13') && r.summary.endsWith('line 20'))
  const s = summarizeExecOutput('$ env\npassword=hunter2\n$ ', 'env')
  assert.ok(!s.summary.includes('hunter2'), 'secrets are redacted like audit details')
}
// empty / missing snapshot
assert.deepEqual(summarizeExecOutput(null, 'ls'), { summary: '', outputLines: 0 })
assert.deepEqual(summarizeExecOutput('$ true\n$ ', 'true'), { summary: '', outputLines: 0 })

// status: never guess success without an exit code
assert.equal(execStatusFrom({ writeOk: true }), 'sent')
assert.equal(execStatusFrom({ writeOk: true, exitCode: 0 }), 'ok')
assert.equal(execStatusFrom({ writeOk: true, exitCode: 2 }), 'failed')
assert.equal(execStatusFrom({ writeOk: true, timedOut: true }), 'failed')
assert.equal(execStatusFrom({ writeOk: false, exitCode: 0 }), 'failed')

// normalize: reject junk, keep valid fields
assert.equal(normalizeExecRecord({ status: 'weird', at: 1 }), undefined)
assert.equal(normalizeExecRecord({ status: 'ok' }), undefined)
assert.deepEqual(normalizeExecRecord({ status: 'failed', at: 5, durationMs: 12.6, exitCode: 1, summary: 'x', outputLines: 1, auditId: ' aud-1 ', extra: 1 }), { status: 'failed', at: 5, durationMs: 13, exitCode: 1, summary: 'x', outputLines: 1, auditId: 'aud-1' })

// duration copy
assert.equal(formatExecDuration(850, 'zh'), '850 ms')
assert.equal(formatExecDuration(1240, 'en'), '1.2 s')
assert.equal(formatExecDuration(125_000, 'zh'), '2 分 05 秒')
assert.equal(formatExecDuration(undefined, 'en'), '—')

// persisted history round trip keeps exec (what "restore history" reads)
{
  const saved = serializeAiChatHistory([
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'c', requestId: 'r1', structured: { action: 'command', description: 'd', command: 'df -h', riskLevel: 'low' }, exec: { status: 'sent', at: 10, durationMs: 1200, summary: 'ok', outputLines: 1, auditId: 'aud-1' } }
  ])
  const back = normalizeAiChatHistory(JSON.parse(JSON.stringify(saved)))
  assert.deepEqual(back[1].exec, { status: 'sent', at: 10, durationMs: 1200, summary: 'ok', outputLines: 1, auditId: 'aud-1' })
  const old = normalizeAiChatHistory([{ role: 'assistant', content: 'legacy' }])
  assert.equal(old[0].exec, undefined)
}

// wiring: main emits exec (incl. blocked), renderer attaches + persists + renders, audit jump
{
  const main = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
  assert.ok(main.includes("type: 'exec', requestId, command: oneLineCmd, payload: { status: 'blocked'"))
  assert.ok(/summarizeExecOutput\(execSnapshot, oneLineCmd\)/.test(main))
  const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
  assert.ok(panel.includes("if (ev.type === 'exec')"))
  assert.ok(panel.includes('if (l.exec) row.exec = l.exec'))
  assert.ok(panel.includes('if (m.exec) row.exec = m.exec'))
  assert.ok(panel.includes('<ExecReplay exec={l.exec} />'))
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  assert.ok(app.includes('window.addEventListener(OPEN_AUDIT_EVENT, onOpen)'))
  assert.ok(app.includes('focusId={t.auditFocusId}'))
  const audit = readFileSync('src/renderer/src/components/AuditLogPanel.tsx', 'utf8')
  assert.ok(audit.includes('data-audit-id={e.id}') && audit.includes("t('exec.notFound')"))
  const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
  for (const k of ['exec.status.ok', 'exec.status.failed', 'exec.status.sent', 'exec.status.blocked', 'exec.auditMissing', 'exec.tailNote', 'exec.notFound']) {
    assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} in zh and en`)
  }
}
console.log('test-exec-replay: ok')
