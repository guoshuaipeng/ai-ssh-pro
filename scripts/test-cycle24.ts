import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recallStep, userPrompts } from '../src/shared/ai-recall'
import { rankSuggestions } from '../src/shared/smart-complete'
import { rankHistoryPick } from '../src/shared/quick-pick'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D52
const p = userPrompts([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'b' }, { role: 'user', content: 'b' }])
ok(JSON.stringify(p) === '["b","a"]', 'newest first, dedupe')
ok(recallStep(p, -1, '', 'up')?.text === 'b', 'up from empty')
ok(recallStep(p, 0, 'b', 'up')?.text === 'a', 'up again')
ok(recallStep(p, 1, 'a', 'up') === null, 'stop at oldest')
ok(recallStep(p, 1, 'a', 'down')?.text === 'b', 'down')
ok(recallStep(p, 0, 'b', 'down')?.text === '' , 'down to empty')
ok(recallStep(p, -1, 'typing', 'up') === null, 'typed text keeps cursor keys')
ok(recallStep(p, 0, 'b edited', 'up') === null, 'edited recall keeps cursor keys')
// D50
const entries = [
  { command: 'make build', hostKey: 'h', count: 9, lastUsed: 9, lastCwd: '/a' },
  { command: 'make test', hostKey: 'h', count: 1, lastUsed: 1, lastCwd: '/b' }
]
ok(rankSuggestions({ query: 'make', hostKey: 'h', entries, cwd: '/b' })[0]!.command === 'make test', 'cmdbar: cwd first')
ok(rankSuggestions({ query: 'make', hostKey: 'h', entries })[0]!.command === 'make build', 'cmdbar: no cwd unchanged')
ok(rankHistoryPick({ query: '', hostKey: 'h', entries, cwd: '/b' })[0]!.value === 'make test', 'ctrl+r empty: cwd first')
ok(rankHistoryPick({ query: '', hostKey: 'h', entries })[0]!.value === 'make build', 'ctrl+r empty: recency without cwd')
// wiring
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes('batchDoneRef.current += 1') && sp.includes("tg('d51.doneN', { n })") && sp.includes('localFs.reveal(task.localPath)'), 'D51 wired')
const ai = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
ok(ai.includes('recallStep(userPrompts(lines), recallRef.current'), 'D52 wired')
const ci = readFileSync('src/renderer/src/components/CommandInput.tsx', 'utf8')
ok(ci.includes('cwd: currentCwd'), 'D50 cmdbar wired')
console.log(JSON.stringify({ test: 'cycle24', total: n, failed: 0 }))
