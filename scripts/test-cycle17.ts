import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldHintShellInt } from '../src/shared/shell-int-hint'
import { resumeCandidate, isTroubleshootTitle, GENERAL_CONVERSATION_KEY } from '../src/shared/ai-conversation'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const base = { enabled: false, shown: false, kind: 'ssh' as const, demo: false, level: 'normal' as const }

ok('D27 hint only once, normal SSH hosts only', () => {
  assert.equal(shouldHintShellInt(base), true)
  assert.equal(shouldHintShellInt({ ...base, shown: true }), false)
  assert.equal(shouldHintShellInt({ ...base, enabled: true }), false)
  assert.equal(shouldHintShellInt({ ...base, demo: true }), false)
  assert.equal(shouldHintShellInt({ ...base, kind: 'local' }), false)
  assert.equal(shouldHintShellInt({ ...base, level: 'production' }), false)
  assert.equal(shouldHintShellInt({ ...base, level: 'readonly' }), false)
  assert.ok(app.includes("tg('d27.hint')") && app.includes('setShellIntOn(true)'))
})
ok('D28 SFTP fills cd (not run) into the session terminal', () => {
  const p = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
  assert.ok(p.includes('sftp-cd-terminal') && p.includes('!isLocal && onCdInTerminal'))
  assert.ok(app.includes('dispatchInjectTerminal(sid, line, false)'))
  assert.ok(app.includes("tg('d28.noTerm')"))
})
ok('D29 resume candidate: same group, newest, within 7 days', () => {
  const now = 10 * 864e5
  const rows = [
    { id: 'a', group: 'g', savedAt: now - 864e5, count: 3 },
    { id: 'b', group: 'g', savedAt: now - 3600e3, count: 2 },
    { id: 'c', group: 'h', savedAt: now, count: 2 },
    { id: 'd', group: 'g', savedAt: now - 8 * 864e5, count: 5 }
  ]
  assert.equal(resumeCandidate(rows, 'g', now)?.id, 'b')
  assert.equal(resumeCandidate(rows, 'x', now), null)
  assert.equal(resumeCandidate(rows, GENERAL_CONVERSATION_KEY, now), null)
  assert.equal(resumeCandidate([{ id: 'e', group: 'g', savedAt: now, count: 0 }], 'g', now), null)
})
ok('D29 resume candidate: prefer troubleshoot title in-window', () => {
  const now = 10 * 864e5
  assert.equal(isTroubleshootTitle('nginx 502 排查'), true)
  assert.equal(isTroubleshootTitle('随便聊聊'), false)
  const rows = [
    { id: 'chat', group: 'g', savedAt: now - 1e3, count: 2, title: '今天天气' },
    { id: 'fix', group: 'g', savedAt: now - 3600e3, count: 4, title: 'nginx 502 怎么查' },
    { id: 'old', group: 'g', savedAt: now - 8 * 864e5, count: 5, title: '磁盘满了' }
  ]
  assert.equal(resumeCandidate(rows, 'g', now)?.id, 'fix')
  // no troubleshoot → newest
  assert.equal(resumeCandidate(rows.filter((r) => r.id !== 'fix'), 'g', now)?.id, 'chat')
})
ok('D29 closed #n conversations are archived; panel offers continue', () => {
  assert.ok(app.includes('convSeenRef') && app.includes('if (c.n <= 1'))
  const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
  assert.ok(ai.includes('ai-resume-last') && ai.includes('restoreArchived(resumeHit.id)'))
  assert.ok(ai.includes('d29.resumeTroubleshoot') && ai.includes('data-resume-kind'))
})
console.log(`test-cycle17: ${n} passed`)
