/**
 * Core-A working memory, compaction, and hybrid recall.
 * Run: npx tsx scripts/test-core-a-context.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EMPTY_THREAD,
  absorbUserTurn,
  actionNeedsHumanInterrupt,
  appendEpisode,
  archiveAndClearRecord,
  buildMemoryPromptBlocks,
  compactTranscript,
  contextBudget,
  createEpisode,
  markWorkingStatus,
  recallEpisodes,
  summarizePlannerStep,
  type TranscriptTurn
} from '../src/main/core-a-context.ts'

let n = 0
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg)
  n++
}

const seeded = absorbUserTurn(EMPTY_THREAD, [{ role: 'user', content: '查看这台机器的磁盘使用率' }])
ok(seeded.switchedFrom == null, 'first question seeds a goal and does not archive')
ok(seeded.ctx.workingMemory?.goal.includes('磁盘'), 'seed keeps the first user goal')
ok(seeded.ctx.workingMemory?.status === 'active', 'seeded goal is active')
ok(seeded.ctx.workingMemory?.id === 'current_task', 'working memory is the current-task block')

const constrained = absorbUserTurn(EMPTY_THREAD, [
  { role: 'user', content: '不要重启服务，查看磁盘。成功标准：给出使用率' }
])
ok(constrained.ctx.workingMemory?.constraints.some((line) => line.includes('不要重启')), 'constraints are captured on the goal')
ok(constrained.ctx.workingMemory?.successCriteria?.includes('给出使用率'), 'success criteria are captured on the goal')

const history: Array<{ role: string; content: string }> = [
  { role: 'user', content: '查看这台机器的磁盘使用率' },
  { role: 'assistant', content: '先看 df' },
  { role: 'user', content: '继续看 inode' }
]
const followed = absorbUserTurn(EMPTY_THREAD, history)
ok(followed.switchedFrom == null, 'a follow-up does not replace the goal')
ok(followed.ctx.workingMemory?.goal.includes('磁盘'), 'seed uses the first user question, not the latest follow-up')
ok(!followed.ctx.workingMemory?.goal.includes('inode'), 'follow-up stays out of the goal text')

const reopened = absorbUserTurn(markWorkingStatus(followed.ctx, 'done'), history)
ok(reopened.switchedFrom == null, 'continuing after done is not a new goal')
ok(reopened.ctx.workingMemory?.status === 'active', 'a follow-up reopens a done goal')

const switched = absorbUserTurn(followed.ctx, [
  ...history,
  { role: 'user', content: '换个问题：nginx 为什么起不来' }
])
ok(switched.switchedFrom?.goal.includes('磁盘'), 'explicit switch archives the previous goal')
ok(switched.ctx.workingMemory?.goal.includes('nginx'), 'explicit switch starts the new goal')
const repeated = absorbUserTurn(switched.ctx, [{ role: 'user', content: '换个问题：nginx 为什么起不来' }])
ok(repeated.switchedFrom == null, 'retrying the same goal does not archive it again')
ok(repeated.ctx.episodes.length === switched.ctx.episodes.length, 'retrying the same goal adds no episode')
ok(
  switched.ctx.episodes.some((episode) => episode.tags.includes('archived-goal') && episode.text.includes('磁盘')),
  'archived goal is an episodic record'
)

const shifted = absorbUserTurn(followed.ctx, [
  ...history,
  { role: 'user', content: 'nginx 服务为什么启动失败' }
])
ok(shifted.switchedFrom != null, 'a low-overlap topic shift replaces the goal')
ok(shifted.ctx.workingMemory?.goal.includes('nginx'), 'topic shift seeds the new goal')

const english = absorbUserTurn(followed.ctx, [
  ...history,
  { role: 'user', content: 'new problem: check sshd journal' }
])
ok(english.switchedFrom != null, 'english new-problem phrase switches the goal')
ok(english.ctx.workingMemory?.goal.toLowerCase().includes('sshd'), 'english switch keeps the new goal')

const episodes = [
  createEpisode({ text: 'nginx 启动失败 journalctl', tags: ['nginx'], now: 1 }),
  createEpisode({ text: '磁盘 df 使用率很高', tags: ['disk'], now: 2 }),
  createEpisode({ text: 'mysql 连接数过多', tags: ['mysql'], now: 3 })
]
const ranked = recallEpisodes('nginx 为什么启动失败', episodes, { topK: 5 })
ok(ranked[0]?.text.includes('nginx'), 'keyword and overlap rank the nginx episode first')
ok(!ranked.some((hit) => hit.text.includes('mysql')), 'unrelated episodes stay out of recall')
ok(ranked.length <= 5, 'recall respects topK')

const many = Array.from({ length: 8 }, (_, index) =>
  createEpisode({ text: `nginx case ${index} 启动失败`, tags: ['nginx'], now: index })
)
ok(recallEpisodes('nginx 启动失败', many, { topK: 5 }).length === 5, 'topK defaults can be tightened to 5')

const quiet = createEpisode({ text: 'zzzz-unique-token', tags: ['quiet'], now: 4 })
const fused = recallEpisodes('nginx 为什么启动失败', [...episodes, quiet], {
  topK: 5,
  embedding: { ranks: [{ id: quiet.id, rank: 1 }] }
})
ok(fused.some((hit) => hit.id === quiet.id && hit.signals.includes('embedding')), 'embedding ranks fuse in without a lexical hit')

const prompt = buildMemoryPromptBlocks({
  working: switched.ctx.workingMemory,
  runningSummary: '先前看过磁盘',
  hits: [{ id: '1', text: '第1步看了 journal', score: 0.02, signals: ['keyword'], tags: [], createdAt: 1 }],
  headings: { working: 'WORKING', summary: 'SUMMARY', recall: 'RECALL' }
})
ok(prompt.text.includes('WORKING'), 'prompt includes the working-memory heading')
ok(prompt.text.includes('goal:'), 'prompt includes the current goal block')
ok(prompt.text.includes('nginx'), 'prompt includes the current goal')
ok(prompt.text.includes('RECALL'), 'prompt includes the recall heading')
ok(prompt.text.includes('- 第1步看了 journal'), 'prompt includes a recalled bullet')
ok(prompt.sections.runningSummary.includes('先前看过磁盘'), 'prompt includes the compacted summary')

const turns: TranscriptTurn[] = []
for (let i = 0; i < 10; i++) {
  const content =
    i === 0 ? 'ALPHA_OLD_QUESTION about disks' : i === 9 ? 'OMEGA_LATEST please check' : `follow up ${i} on disks`
  turns.push({ role: 'user', content })
  turns.push({ role: 'assistant', content: JSON.stringify({ action: 'end', description: `answer ${i}` }) })
}
const folded = compactTranscript(turns, EMPTY_THREAD, 8)
ok(folded.recent.length === 16, 'recent window keeps the last 8 exchanges')
ok(folded.recent.some((turn) => turn.content.includes('OMEGA_LATEST')), 'latest turn stays in the window')
ok(!folded.recent.some((turn) => turn.content.includes('ALPHA_OLD_QUESTION')), 'older turns leave the window')
ok(folded.ctx.runningSummary.includes('ALPHA_OLD_QUESTION'), 'older turns are summarized instead of dropped')
ok(
  folded.ctx.episodes.some((episode) => episode.tags.includes('compaction') && episode.text.includes('ALPHA_OLD_QUESTION')),
  'folded turns are stored as a durable episode'
)
const again = compactTranscript(turns, folded.ctx, 8)
ok(again.ctx.episodes.length === folded.ctx.episodes.length, 'the same prefix is not summarized twice')

let packed = appendEpisode(EMPTY_THREAD, createEpisode({ text: 'ALPHA_OLD_QUESTION kept', tags: ['compaction'], now: 1 }))
for (let i = 0; i < 45; i++) {
  packed = appendEpisode(packed, createEpisode({ text: `step note ${i}`, tags: ['step'], now: i + 2 }))
}
ok(packed.episodes.some((episode) => episode.text.includes('ALPHA_OLD_QUESTION')), 'compaction episodes outlive step notes')
ok(packed.episodes.length <= 40, 'episode list stays capped')

const secretTurns: TranscriptTurn[] = [
  { role: 'user', content: 'please use Bearer sk-live-SECRETVALUE' },
  { role: 'assistant', content: '{"action":"end","description":"noted"}' },
  ...turns.slice(2)
]
const redacted = compactTranscript(secretTurns, EMPTY_THREAD, 8)
ok(!redacted.ctx.runningSummary.includes('sk-live-SECRETVALUE'), 'compacted summary redacts bearer tokens')
ok(!redacted.ctx.episodes.some((episode) => episode.text.includes('sk-live-SECRETVALUE')), 'episodes redact bearer tokens')

const step = summarizePlannerStep({
  step: 2,
  action: 'command',
  description: 'connect with the given password',
  command: 'mysql -p password=hunter2'
})
ok(!step.text.includes('hunter2'), 'step summaries redact password values')
ok(step.tags.includes('step'), 'step summaries are tagged for recall')

const cleared = archiveAndClearRecord({
  notes: ['keep-me'],
  recentCommands: ['uptime'],
  observations: ['load 0.1'],
  taskSummaries: ['[open] old'],
  updatedAt: 1,
  workingMemory: {
    id: 'current_task' as const,
    goal: '查磁盘',
    constraints: ['不要重启'],
    status: 'active' as const,
    updatedAt: 1
  },
  episodes: [createEpisode({ text: 'sum', now: 1 })],
  runningSummary: 'earlier',
  compactedCursor: 'abc'
})
ok(cleared.workingMemory == null, 'clear drops working memory')
ok(cleared.episodes.length === 0, 'clear drops episodic summaries')
ok(cleared.runningSummary === '', 'clear drops the running summary')
ok(cleared.observations[0] === 'load 0.1', 'clear keeps observations')
ok(cleared.recentCommands[0] === 'uptime', 'clear keeps recent commands')
ok(cleared.notes.includes('keep-me'), 'clear keeps existing notes')
ok(cleared.notes.some((note) => note.includes('archived-goal') && note.includes('查磁盘')), 'clear archives the goal into notes')
ok(cleared.taskSummaries.some((line) => line.includes('查磁盘')), 'clear archives the goal into task summaries')

ok(actionNeedsHumanInterrupt('command') === true, 'ssh commands require a human interrupt')
ok(actionNeedsHumanInterrupt('tool_call') === false, 'read-only tool calls are not interrupted')
ok(actionNeedsHumanInterrupt('end') === false, 'end is not an interrupt')

const budget = contextBudget({
  workingChars: 10,
  workingItems: 1,
  summaryChars: 20,
  recallChars: 30,
  recallItems: 2,
  recentChars: 40,
  recentItems: 3,
  systemChars: 100
})
ok(budget.totalChars === 140, 'context budget is system prompt plus the recent window')
ok(budget.slices.find((slice) => slice.name === 'working')?.chars === 10, 'working-memory slice reports its chars')
ok(budget.slices.find((slice) => slice.name === 'recall')?.items === 2, 'recall slice reports how many hits entered')
ok(budget.slices.some((slice) => slice.name === 'recentWindow'), 'recent window is its own slice')

const root = join(import.meta.dirname, '..')
const agent = readFileSync(join(root, 'src/main/ai-interactive-agent.ts'), 'utf8')
const memory = readFileSync(join(root, 'src/main/core-a-memory.ts'), 'utf8')
const store = readFileSync(join(root, 'src/main/app-store.ts'), 'utf8')
ok(agent.includes('buildMemoryPromptBlocks'), 'planner inserts the memory blocks')
ok(agent.includes('recallEpisodes'), 'planner recalls before the model call')
ok(agent.includes('compactTranscript'), 'planner compacts instead of only slicing')
ok(!agent.includes('compactConversation'), 'hard-drop compaction helper is gone')
ok(agent.includes("kind: 'context'"), 'debug channel records context slices')
ok(agent.includes('actionNeedsHumanInterrupt'), 'confirm-before-run goes through the interrupt helper')
ok(agent.includes('相关历史回忆'), 'prompt heading names recalled history')
ok(agent.includes('工作记忆（当前目标）'), 'prompt heading names working memory')
ok(store.includes('archiveAndClearThreadContext'), 'clearing chat history archives that thread')
ok(!memory.includes('inventory-store'), 'thread memory does not import host inventory')
ok(!memory.includes('getInventoryStore'), 'thread clear does not call the inventory store')

console.log(`\n---\ndone: ${n} passed`)
