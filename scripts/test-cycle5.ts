import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { planAutoSave, remoteChanged } from '../src/shared/remote-edit'
import { planPaste } from '../src/shared/paste-plan'
import { fenceSelection } from '../src/shared/ask-context'
let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok - ' + name) }
const base = { enabled: true, dirty: true, blocked: false, truncated: false, conflict: false, saving: false, loading: false, mode: 'edit' as const }
ok('D5 auto-save gate', () => {
  assert.equal(planAutoSave(base), true)
  for (const k of ['blocked', 'truncated', 'conflict', 'saving', 'loading'] as const) assert.equal(planAutoSave({ ...base, [k]: true }), false, k)
  assert.equal(planAutoSave({ ...base, enabled: false }), false)
  assert.equal(planAutoSave({ ...base, dirty: false }), false)
  assert.equal(planAutoSave({ ...base, mode: 'diff' }), false)
})
ok('D5 conflict detection', () => {
  assert.equal(remoteChanged('a', { content: 'a', truncated: false }), false)
  assert.equal(remoteChanged('a', { content: 'b', truncated: false }), true)
  assert.equal(remoteChanged('a', { content: 'b', truncated: true }), false)
})
ok('D7 single line passes through', () => {
  assert.equal(planPaste('ls -la').multiline, false)
  assert.equal(planPaste('ls -la\n').multiline, false)
})
ok('D7 multi-line plan', () => {
  const p = planPaste('cd /tmp\r\nrm -rf /\nls\n')
  assert.equal(p.multiline, true)
  assert.equal(p.runsLast, true)
  assert.deepEqual(p.lines, ['cd /tmp', 'rm -rf /', 'ls'])
  assert.deepEqual(p.risky.map((r) => r.index), [1])
  assert.equal(p.joined, 'cd /tmp && rm -rf / && ls')
})
ok('D7 join refused when unsafe', () => {
  assert.equal(planPaste('cat <<EOF\nx\nEOF').joined, null)
  assert.equal(planPaste('echo a \\\n  b').joined, null)
  assert.equal(planPaste('# note\nls').joined, null)
  assert.equal(planPaste('ls |\ngrep x').joined, null)
})
ok('D6 fence', () => {
  assert.equal(fenceSelection('  a  \r\nb\n'), '```\n  a\nb\n```')
  assert.equal(fenceSelection('x ``` y'), '````\nx ``` y\n````')
  const long = fenceSelection('a'.repeat(10) + 'TAIL', 4)
  assert.ok(long.includes('…\nTAIL'))
})
ok('wiring', () => {
  const ed = readFileSync('src/renderer/src/components/RemoteTextEditor.tsx', 'utf8')
  for (const s of ['remote-conflict', 'remoteChanged(', 'planAutoSave(', 'remote-autosave', "mode === 'conflict'"]) assert.ok(ed.includes(s), s)
  const term = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
  for (const s of ['paste-preview', 'planPaste(', "addEventListener('paste'", 'requestAskWithContext(', 'aiAskCtx']) assert.ok(term.includes(s), s)
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
  assert.ok(app.includes('AI_ASK_CONTEXT_EVENT') && app.includes('fenceSelection(') && app.includes('setAiPrefill('))
  const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
  assert.ok(ai.includes('takeAiPrefill()') && ai.includes('AI_PREFILL_EVENT'))
})
console.log(`\n${n} passed`)
