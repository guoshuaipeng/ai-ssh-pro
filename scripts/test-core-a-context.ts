/**
 * Core-A working memory, compaction, and hybrid recall.
 * Run: npx tsx scripts/test-core-a-context.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { visibleWorkingGoal } from '../src/shared/working-memory-view.ts'
import {
  EMPTY_THREAD,
  absorbUserTurn,
  actionNeedsHumanInterrupt,
  appendEpisode,
  archiveAndClearRecord,
  buildMemoryPromptBlocks,
  compactTranscript,
  confirmBypassAllowed,
  contextBudget,
  createEpisode,
  emptyOmBudget,
  observeOmBudget,
  observationBulletCap,
  cancelHitl,
  createHitlLoop,
  hitlIsPlannable,
  interruptForProposal,
  markHitlExecuting,
  markHitlObserving,
  markWorkingStatus,
  patchWritePermitted,
  recallEpisodes,
  resumeHitl,
  sideEffectExecutionPermitted,
  summarizePlannerStep,
  type TranscriptTurn
} from '../src/main/core-a-context.ts'
import {
  annotateUnappliedFailure,
  applyPatchDraft,
  createMockTree,
  decidePatch,
  explainGateFailure,
  isSafeMockPath,
  parseNpmTestFailure,
  patchDraftConfirmCard,
  reviewGateFailure,
  reviewNpmTestFailure
} from '../src/main/core-a-tfl.ts'

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
  observations: [],
  runningSummary: '先前看过磁盘',
  hits: [{ id: '1', text: '第1步看了 journal', score: 0.02, signals: ['keyword'], tags: [], createdAt: 1 }],
  headings: { working: 'WORKING', observations: 'OBSERVATIONS', summary: 'SUMMARY', recall: 'RECALL' }
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

const longTurns: TranscriptTurn[] = [
  { role: 'user', content: 'EARLY_FACT /var/log 48G on /dev/sda1' },
  { role: 'assistant', content: 'noted EARLY_FACT /var/log' }
]
for (let i = 0; i < 20; i++) {
  longTurns.push({ role: 'user', content: `filler nginx ${i} ${'x'.repeat(180)}` })
  longTurns.push({ role: 'assistant', content: `filler answer ${i}` })
}
longTurns.push({ role: 'user', content: 'LATE_FACT omega' }, { role: 'assistant', content: 'late answer' })
const foldedLong = compactTranscript(longTurns, EMPTY_THREAD, 8)
ok(foldedLong.ctx.runningSummary.includes('EARLY_FACT'), 'compaction keeps the earliest fact in the summary')
ok(foldedLong.recent.some((turn) => turn.content.includes('LATE_FACT')), 'the latest turn stays in the window')
ok(!foldedLong.recent.some((turn) => turn.content.includes('EARLY_FACT')), 'the early fact left the raw window')

let packed = appendEpisode(EMPTY_THREAD, createEpisode({ text: 'ALPHA_OLD_QUESTION kept', tags: ['compaction'], now: 1 }))
for (let i = 0; i < 45; i++) {
  packed = appendEpisode(packed, createEpisode({ text: `step note ${i}`, tags: ['step'], now: i + 2 }))
}
ok(packed.episodes.some((episode) => episode.text.includes('ALPHA_OLD_QUESTION')), 'compaction episodes outlive step notes')
ok(packed.episodes.length <= 40, 'episode list stays capped')

const longOm: TranscriptTurn[] = [
  { role: 'user', content: '查看磁盘使用率' },
  { role: 'assistant', content: JSON.stringify({ action: 'end', description: '先看磁盘' }) }
]
for (let i = 0; i < 4; i++) {
  longOm.push({ role: 'user', content: `filler turn ${i} ${'n'.repeat(120)} about nothing` })
  longOm.push({ role: 'assistant', content: JSON.stringify({ action: 'end', description: `filler ${i}` }) })
}
longOm.push({ role: 'user', content: 'MID_OM_FACT redis listens on 127.0.0.1:6379 only' })
longOm.push({ role: 'assistant', content: JSON.stringify({ action: 'end', description: 'noted the bind fact' }) })
for (let i = 0; i < 20; i++) {
  longOm.push({ role: 'user', content: `filler turn ${100 + i} ${'n'.repeat(120)} about nothing` })
  longOm.push({ role: 'assistant', content: JSON.stringify({ action: 'end', description: `later filler ${i}` }) })
}
longOm.push({ role: 'user', content: 'LATE_WINDOW_FACT please answer now' })
longOm.push({ role: 'assistant', content: JSON.stringify({ action: 'end', description: 'latest' }) })
const foldedOm = compactTranscript(longOm, EMPTY_THREAD, 8)
ok(foldedOm.recent.some((turn) => turn.content.includes('LATE_WINDOW_FACT')), 'the latest turn stays in the window')
ok(!foldedOm.recent.some((turn) => turn.content.includes('MID_OM_FACT')), 'the middle fact left the raw window')
ok(!foldedOm.ctx.runningSummary.includes('MID_OM_FACT'), 'the summary cap drops the middle fact')
ok(
  foldedOm.ctx.observationalMemory.some((bullet) => bullet.text.includes('MID_OM_FACT') && bullet.text.includes('127.0.0.1:6379')),
  'observational bullets keep the middle fact'
)
const againOm = compactTranscript(longOm, foldedOm.ctx, 8)
ok(againOm.ctx.observationalMemory.length === foldedOm.ctx.observationalMemory.length, 'the same prefix is not observed twice')
const promptOm = buildMemoryPromptBlocks({
  working: foldedOm.ctx.workingMemory,
  observations: foldedOm.ctx.observationalMemory,
  runningSummary: foldedOm.ctx.runningSummary,
  hits: [],
  headings: { working: 'WORKING', observations: 'OBSERVATIONS', summary: 'SUMMARY', recall: 'RECALL' }
})
ok(promptOm.sections.observations.includes('MID_OM_FACT'), 'planner observational section keeps the older fact')
ok(promptOm.sections.observations.includes('127.0.0.1:6379'), 'planner observational section keeps the older address')
ok(!promptOm.sections.runningSummary.includes('MID_OM_FACT'), 'the surviving fact is not only the running summary')
ok(promptOm.text.indexOf('OBSERVATIONS') < promptOm.text.indexOf('SUMMARY'), 'observational bullets are injected ahead of the summary')
ok(foldedOm.omBudget.summaryTruncated === true, 'summary cap is an observable budget signal')
ok(foldedOm.omBudget.truncated === true, 'a capped summary sets truncated')
ok(observeOmBudget(foldedOm.ctx).summaryTruncated === true, 'the summary mark sticks on the thread')
ok(againOm.omBudget.truncatedBullets === foldedOm.omBudget.truncatedBullets, 'a repeated prefix does not count the same cut twice')

const s20Turns: TranscriptTurn[] = [
  { role: 'user', content: '记下 OM_S20_RARE_FACT 只监听 127.0.0.1:18447 配置 /etc/s20/edge.conf' },
  { role: 'assistant', content: JSON.stringify({ action: 'end', description: 'noted' }) }
]
for (let i = 0; i < 48; i++) {
  s20Turns.push({
    role: 'user',
    content: `更正监听为 10.8.8.8:9${String(i).padStart(3, '0')} 路径 /opt/factory/s20-invented Use% ${50 + (i % 40)}% 状态 FACTORY_DOWN`
  })
  s20Turns.push({ role: 'assistant', content: JSON.stringify({ action: 'end', description: `filler ${i}` }) })
}
s20Turns.push({ role: 'user', content: '先前的稀有事实还在吗' })
const foldedS20 = compactTranscript(s20Turns, EMPTY_THREAD, 8)
ok(!foldedS20.recent.some((turn) => turn.content.includes('OM_S20_RARE_FACT')), 'S20 rare fact leaves the raw window')
ok(
  foldedS20.ctx.observationalMemory.some(
    (bullet) =>
      bullet.text.includes('OM_S20_RARE_FACT') &&
      bullet.text.includes('127.0.0.1:18447') &&
      bullet.text.includes('/etc/s20/edge.conf')
  ),
  'S20 contradictory filler does not overwrite the earlier rare fact'
)
ok(
  foldedS20.ctx.observationalMemory.some((bullet) => bullet.text.includes('/opt/factory/s20-invented')),
  'S20 contradictory filler stays as history beside the rare fact'
)
const promptS20 = buildMemoryPromptBlocks({
  working: foldedS20.ctx.workingMemory,
  observations: foldedS20.ctx.observationalMemory,
  runningSummary: foldedS20.ctx.runningSummary,
  hits: [],
  headings: { working: 'WORKING', observations: 'OBSERVATIONS', summary: 'SUMMARY', recall: 'RECALL' }
})
ok(promptS20.sections.observations.includes('OM_S20_RARE_FACT'), 'S20 planner observational section keeps the rare token')
ok(promptS20.sections.observations.includes('127.0.0.1:18447'), 'S20 planner observational section keeps the rare port')
ok(promptS20.sections.observations.includes('/etc/s20/edge.conf'), 'S20 planner observational section keeps the rare path')
ok(foldedS20.omBudget.droppedBullets > 0, 'overflowing bullets record how many were dropped')
ok(foldedS20.omBudget.truncated === true, 'a dropped bullet is a truncation signal')
ok(foldedS20.omBudget.nearBudget === true, 'a full bullet list is near the budget')
ok(foldedS20.ctx.observationalMemory.length <= 40, 'the production bullet cap still holds')
ok(foldedS20.omBudget.bulletCap === 40, 'the signal reports the production bullet cap')

const secretTurns: TranscriptTurn[] = [
  { role: 'user', content: 'please use Bearer sk-live-SECRETVALUE' },
  { role: 'assistant', content: '{"action":"end","description":"noted"}' },
  ...turns.slice(2)
]
const redacted = compactTranscript(secretTurns, EMPTY_THREAD, 8)
ok(!redacted.ctx.runningSummary.includes('sk-live-SECRETVALUE'), 'compacted summary redacts bearer tokens')
ok(!redacted.ctx.episodes.some((episode) => episode.text.includes('sk-live-SECRETVALUE')), 'episodes redact bearer tokens')
ok(
  !redacted.ctx.observationalMemory.some((bullet) => bullet.text.includes('sk-live-SECRETVALUE')),
  'observational bullets redact bearer tokens'
)

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
    hostFacts: ['WM_KEEP'],
    status: 'active' as const,
    updatedAt: 1
  },
  episodes: [createEpisode({ text: 'sum', now: 1 })],
  runningSummary: 'earlier',
  observationalMemory: [{ id: 'om1', text: 'user: MID_OM_FACT redis 127.0.0.1:6379', createdAt: 1 }],
  compactedCursor: 'abc'
})
ok(cleared.workingMemory == null, 'clear drops working memory')
ok(cleared.episodes.length === 0, 'clear drops episodic summaries')
ok(cleared.runningSummary === '', 'clear drops the running summary')
ok(cleared.observationalMemory.length === 0, 'clear drops observational bullets')
ok(
  cleared.omBudget?.droppedBullets === 0 && cleared.omBudget.truncatedBullets === 0 && cleared.omBudget.summaryTruncated === false,
  'clear resets the observational budget mark'
)
ok(cleared.observations[0] === 'load 0.1', 'clear keeps observations')
ok(cleared.recentCommands[0] === 'uptime', 'clear keeps recent commands')
ok(cleared.notes.includes('keep-me'), 'clear keeps existing notes')
ok(cleared.notes.some((note) => note.includes('archived-goal') && note.includes('查磁盘')), 'clear archives the goal into notes')
ok(cleared.taskSummaries.some((line) => line.includes('查磁盘')), 'clear archives the goal into task summaries')

ok(actionNeedsHumanInterrupt('command') === true, 'ssh commands require a human interrupt')
ok(actionNeedsHumanInterrupt('tool_call') === false, 'read-only tool calls are not interrupted')
ok(actionNeedsHumanInterrupt('tool_call', 'get_terminal_snapshot') === false, 'terminal snapshots are not interrupted')
ok(actionNeedsHumanInterrupt('tool_call', 'ssh_exec') === true, 'ssh_exec stays gated even as a tool_call')
ok(actionNeedsHumanInterrupt('tool_call', 'shell') === true, 'shell stays gated')
ok(actionNeedsHumanInterrupt('end') === false, 'end is not an interrupt')
ok(confirmBypassAllowed(true) === false, 'autoApproveLowRisk cannot bypass confirm')
ok(confirmBypassAllowed(false) === false, 'confirm bypass stays closed when the flag is off')

const planned = createHitlLoop()
ok(planned.phase === 'planning', 'a step starts in planning')
const lowRisk = interruptForProposal(planned, {
  action: 'command',
  command: 'uptime',
  riskLevel: 'low',
  requestId: 'r-low',
  autoApproveLowRisk: true
})
ok(lowRisk.phase === 'interrupted', 'low-risk command still interrupts when auto-approve is requested')
ok(sideEffectExecutionPermitted(lowRisk) === false, 'an interrupted command cannot write')
ok(sideEffectExecutionPermitted(markHitlExecuting(lowRisk)) === false, 'executing is unreachable without resume')
const highRisk = interruptForProposal(planned, {
  action: 'command',
  command: 'rm -rf /var/log',
  riskLevel: 'high',
  requestId: 'r-high'
})
ok(highRisk.phase === 'interrupted', 'high-risk command interrupts')
const denied = resumeHitl(highRisk, false)
ok(denied.phase === 'cancelled' && denied.resume === 'deny', 'decline cancels the interrupt')
ok(sideEffectExecutionPermitted(markHitlExecuting(denied)) === false, 'a denied command never becomes executable')
ok(hitlIsPlannable(denied) === false, 'a deny is not a plannable state')
ok(cancelHitl(denied).phase === 'cancelled' && cancelHitl(denied).resume === 'deny', 'cancel does not rewrite a deny')
const cancelled = cancelHitl(highRisk)
ok(hitlIsPlannable(cancelled), 'cancel returns the interrupt to planning')
ok(cancelled.phase === 'planning' && cancelled.resume == null && cancelled.command == null, 'cancel drops the proposal')
ok(sideEffectExecutionPermitted(markHitlExecuting(cancelled)) === false, 'a cancelled command cannot write')
ok(resumeHitl(cancelled, true).phase === 'planning', 'a cleared interrupt cannot be resumed')
const replanned = interruptForProposal(cancelled, {
  action: 'command',
  command: 'uptime',
  riskLevel: 'low',
  requestId: 's23-replan'
})
ok(replanned.phase === 'interrupted' && replanned.command === 'uptime', 'a cleared loop can interrupt for a new plan')
ok(replanned.requestId === 's23-replan', 'the new plan is not the cancelled request')
const approved = markHitlExecuting(resumeHitl(highRisk, true))
ok(approved.phase === 'executing' && approved.resume === 'approve', 'approve resumes into executing')
ok(sideEffectExecutionPermitted(approved) === true, 'an approved command may write')
ok(markHitlObserving(approved).phase === 'observing', 'after the write the loop is observing')
const snap = interruptForProposal(planned, { action: 'tool_call', toolName: 'get_terminal_snapshot' })
ok(snap.phase === 'executing' && snap.resume == null, 'a snapshot does not interrupt')
ok(sideEffectExecutionPermitted(snap) === false, 'a snapshot cannot take the SSH write path')
const riskyTool = interruptForProposal(planned, { action: 'tool_call', toolName: 'run_command', command: 'reboot', riskLevel: 'high' })
ok(riskyTool.phase === 'interrupted', 'run_command interrupts')
ok(sideEffectExecutionPermitted(markHitlExecuting(resumeHitl(riskyTool, true))) === false, 'a risky tool_call cannot use the SSH write gate')
ok(resumeHitl(planned, true).phase === 'planning', 'resume ignores a step that is not interrupted')
const patchProposal = interruptForProposal(planned, {
  action: 'patch',
  toolName: 'apply_patch',
  command: 'draft',
  riskLevel: 'high',
  requestId: 'r-patch',
  autoApproveLowRisk: true
})
ok(patchProposal.phase === 'interrupted', 'a patch draft interrupts even when auto-approve is requested')
ok(patchWritePermitted(patchProposal) === false, 'an interrupted patch cannot write')
ok(sideEffectExecutionPermitted(markHitlExecuting(resumeHitl(patchProposal, true))) === false, 'an approved patch is not an SSH write')
ok(patchWritePermitted(markHitlExecuting(resumeHitl(patchProposal, true))) === true, 'approve then executing opens the patch gate')
ok(patchWritePermitted(resumeHitl(patchProposal, false)) === false, 'decline keeps the patch gate closed')
ok(
  patchWritePermitted({ ...markHitlExecuting(resumeHitl(patchProposal, true)), requestId: null }) === false,
  'agree without a requestId keeps the patch gate closed'
)
ok(
  patchWritePermitted({ ...markHitlExecuting(resumeHitl(patchProposal, true)), requestId: '   ' }) === false,
  'a blank requestId keeps the patch gate closed'
)

const budget = contextBudget({
  workingChars: 10,
  workingItems: 1,
  observationChars: 12,
  observationItems: 1,
  summaryChars: 20,
  recallChars: 30,
  recallItems: 2,
  recentChars: 40,
  recentItems: 3,
  systemChars: 100
})
ok(budget.totalChars === 140, 'context budget is system prompt plus the recent window')
ok(budget.slices.find((slice) => slice.name === 'working')?.chars === 10, 'working-memory slice reports its chars')
ok(budget.slices.find((slice) => slice.name === 'observations')?.chars === 12, 'observational-memory slice reports its chars')
ok(budget.slices.find((slice) => slice.name === 'observations')?.items === 1, 'observational-memory slice reports how many bullets entered')
ok(budget.slices.find((slice) => slice.name === 'recall')?.items === 2, 'recall slice reports how many hits entered')
ok(budget.slices.some((slice) => slice.name === 'recentWindow'), 'recent window is its own slice')
ok(observationBulletCap() === 40, 'default observational bullet cap stays 40')
const quietBudget = observeOmBudget(EMPTY_THREAD)
ok(quietBudget.truncated === false && quietBudget.nearBudget === false, 'an empty thread is not at the budget boundary')
ok(
  quietBudget.bulletCap === 40 && quietBudget.bulletCharCap === 180 && quietBudget.summaryCharCap === 1500,
  'the budget signal reports the production caps'
)
ok(emptyOmBudget().droppedBullets === 0, 'a fresh budget mark has no drops')
process.env.AISS_OM_BULLET_CAP = '0'
ok(observationBulletCap() === 40, 'a bullet cap below 2 stays at the default')
process.env.AISS_OM_BULLET_CAP = '80'
ok(observationBulletCap() === 40, 'a bullet cap above 40 stays at the default')
process.env.AISS_OM_BULLET_CAP = '4'
try {
  ok(observationBulletCap() === 4, 'the harness may lower the bullet cap to reach the boundary')
  const fact = `请记下稀有事实 OM_S25_RARE_FACT 只监听 127.0.0.1:18452，配置 /etc/s25/edge.conf。 ${'x'.repeat(80)}`
  ok(fact.length > 140, 'the boundary fact is longer than one observational line')
  const history: TranscriptTurn[] = []
  let ctx = EMPTY_THREAD
  const fold = (user: string, assistants: string[]) => {
    history.push({ role: 'user', content: user })
    const seen = compactTranscript(history, ctx, 8)
    ctx = seen.ctx
    for (const assistant of assistants) history.push({ role: 'assistant', content: assistant })
    return seen.omBudget
  }
  fold('先记录这台机器，不要删除文件。', ['先到这里。'])
  fold(fact, ['已记下该监听约束，先到这里。'])
  fold('请执行只读命令 echo S25_HOSTA_CMD，确认后再发。', ['建议执行 echo S25_HOSTA_CMD。', '命令已确认后执行。'])
  let boundary = observeOmBudget(ctx)
  for (let i = 4; i <= 16; i++) {
    boundary = fold(`继续无关项 ${i}。`, [`无关项 ${i} 结束。`])
  }
  ok(boundary.truncated === true, 'the boundary fixture records truncation')
  ok(boundary.nearBudget === true, 'the boundary fixture is near the bullet cap')
  ok(boundary.droppedBullets >= 1, 'the boundary fixture drops at least one bullet')
  ok(boundary.truncatedBullets >= 1, 'the long fact line is an observable cut')
  ok(boundary.bulletCap === 4, 'the boundary signal reports the tightened cap')
  ok(
    ctx.observationalMemory.some(
      (bullet) =>
        bullet.text.includes('OM_S25_RARE_FACT') &&
        bullet.text.includes('127.0.0.1:18452') &&
        bullet.text.includes('/etc/s25/edge.conf')
    ),
    'a concrete rare fact survives the bullet cap'
  )
  ok(
    ctx.observationalMemory.some((bullet) => bullet.text.includes('S25_HOSTA_CMD')),
    'the confirmed command token survives the bullet cap'
  )
  const otherHost = observeOmBudget(EMPTY_THREAD)
  ok(otherHost.truncated === false && otherHost.droppedBullets === 0, 'another host does not inherit the budget mark')
} finally {
  delete process.env.AISS_OM_BULLET_CAP
}
ok(observationBulletCap() === 40, 'clearing the harness cap restores 40')

process.env.AISS_OM_BULLET_CAP = '4'
try {
  const goal = '当前目标是守住 WM_S26_GOAL。不要删除 WM_S26_CONSTRAINT。'
  const fact = `继续记下稀有主机事实 WM_S26_RARE_FACT 只监听 127.0.0.1:18453，配置 /etc/s26/edge.conf。 ${'x'.repeat(80)}`
  const seededGoal = absorbUserTurn(EMPTY_THREAD, [{ role: 'user', content: goal }])
  ok(seededGoal.ctx.workingMemory?.goal.includes('WM_S26_GOAL'), 'S26 seeds the active goal')
  ok(
    seededGoal.ctx.workingMemory?.constraints.some((line) => line.includes('WM_S26_CONSTRAINT')),
    'S26 seeds the constraint on the scratchpad'
  )
  const withFact = absorbUserTurn(seededGoal.ctx, [
    { role: 'user', content: goal },
    { role: 'assistant', content: '先到这里。' },
    { role: 'user', content: fact }
  ])
  ok(withFact.switchedFrom == null, 'a follow-up host fact does not replace the active goal')
  ok(withFact.ctx.workingMemory?.goal.includes('WM_S26_GOAL'), 'S26 goal stays after the host fact')
  ok(withFact.ctx.workingMemory?.hostFacts.includes('WM_S26_RARE_FACT'), 'S26 stores the rare host fact on the scratchpad')
  ok(withFact.ctx.workingMemory?.hostFacts.includes('127.0.0.1:18453'), 'S26 scratchpad keeps the host port')
  ok(withFact.ctx.workingMemory?.hostFacts.includes('/etc/s26/edge.conf'), 'S26 scratchpad keeps the host path')
  const switchedFacts = absorbUserTurn(withFact.ctx, [
    { role: 'user', content: goal },
    { role: 'user', content: '换个问题：nginx 为什么起不来' }
  ])
  ok(switchedFacts.ctx.workingMemory?.goal.includes('nginx'), 'an explicit switch still replaces the goal')
  ok(
    switchedFacts.ctx.workingMemory?.hostFacts.includes('WM_S26_RARE_FACT'),
    'an explicit switch does not wipe host facts'
  )
  const turns: TranscriptTurn[] = [
    { role: 'user', content: goal },
    { role: 'assistant', content: '先到这里。' },
    { role: 'user', content: fact },
    { role: 'assistant', content: '已记下该监听约束，先到这里。' },
    { role: 'user', content: '继续，请执行只读命令 echo S26_HOSTA_CMD，确认后再发。' },
    { role: 'assistant', content: '建议执行 echo S26_HOSTA_CMD。' },
    { role: 'assistant', content: '命令已确认后执行。' },
    { role: 'user', content: '继续无关叙述甲乙丙丁，没有新的监听。' },
    { role: 'assistant', content: '叙述甲乙丙丁结束。' }
  ]
  for (let i = 5; i <= 16; i++) {
    turns.push({ role: 'user', content: `继续无关项 ${i}。` })
    turns.push({ role: 'assistant', content: `无关项 ${i} 结束。` })
  }
  const foldedWm = compactTranscript(turns, withFact.ctx, 8)
  ok(foldedWm.omBudget.truncated === true && foldedWm.omBudget.droppedBullets >= 1, 'S26 drops narrative bullets under the cap')
  ok(
    !foldedWm.ctx.observationalMemory.some((bullet) => bullet.text.includes('甲乙丙丁')),
    'S26 narrative token is not left in observational memory'
  )
  ok(foldedWm.ctx.workingMemory?.goal.includes('WM_S26_GOAL'), 'S26 goal survives observational truncation')
  ok(
    foldedWm.ctx.workingMemory?.constraints.some((line) => line.includes('WM_S26_CONSTRAINT')),
    'S26 constraint survives observational truncation'
  )
  ok(
    foldedWm.ctx.workingMemory?.hostFacts.includes('WM_S26_RARE_FACT'),
    'S26 host fact survives observational truncation'
  )
  const promptWm = buildMemoryPromptBlocks({
    working: foldedWm.ctx.workingMemory,
    observations: foldedWm.ctx.observationalMemory,
    runningSummary: foldedWm.ctx.runningSummary,
    hits: [],
    headings: { working: 'WORKING', observations: 'OBSERVATIONS', summary: 'SUMMARY', recall: 'RECALL' }
  })
  ok(promptWm.sections.working.includes('WM_S26_GOAL'), 'S26 goal is injected after truncation')
  ok(promptWm.sections.working.includes('WM_S26_CONSTRAINT'), 'S26 constraint is injected after truncation')
  ok(promptWm.sections.working.includes('hostFacts:'), 'S26 host facts are a structured prompt line')
  ok(promptWm.sections.working.includes('WM_S26_RARE_FACT'), 'S26 host fact is injected after truncation')
  ok(promptWm.sections.working.includes('127.0.0.1:18453'), 'S26 port is injected from the scratchpad')
  ok(!promptWm.sections.observations.includes('甲乙丙丁'), 'S26 dropped narrative stays out of the observation section')
  const otherThread = absorbUserTurn(EMPTY_THREAD, [{ role: 'user', content: '这台机器没有先前记录。' }])
  const otherPrompt = buildMemoryPromptBlocks({
    working: otherThread.ctx.workingMemory,
    observations: otherThread.ctx.observationalMemory,
    runningSummary: '',
    hits: [],
    headings: { working: 'WORKING', observations: 'OBSERVATIONS', summary: 'SUMMARY', recall: 'RECALL' }
  })
  ok(!otherPrompt.text.includes('WM_S26_GOAL'), 'another thread does not inherit the scratchpad goal')
  ok(!otherPrompt.text.includes('WM_S26_CONSTRAINT'), 'another thread does not inherit the constraint')
  ok(!otherPrompt.text.includes('WM_S26_RARE_FACT'), 'another thread does not inherit the host fact')
} finally {
  delete process.env.AISS_OM_BULLET_CAP
}
ok(observationBulletCap() === 40, 'the S26 harness cap does not stick')

const root = join(import.meta.dirname, '..')
const pkg = readFileSync(join(root, 'package.json'), 'utf8')
ok(!pkg.includes('@mastra'), 'observational memory does not depend on the Mastra package')
ok(!pkg.includes('langgraph') && !pkg.includes('@langchain'), 'HITL does not depend on LangGraph')
ok(pkg.includes('"version": "0.6.58"'), 'package version')
const agent = readFileSync(join(root, 'src/main/ai-interactive-agent.ts'), 'utf8')
const memory = readFileSync(join(root, 'src/main/core-a-memory.ts'), 'utf8')
const store = readFileSync(join(root, 'src/main/app-store.ts'), 'utf8')
ok(agent.includes('buildMemoryPromptBlocks'), 'planner inserts the memory blocks')
ok(agent.includes('recallEpisodes'), 'planner recalls before the model call')
ok(agent.includes('compactTranscript'), 'planner compacts instead of only slicing')
ok(!agent.includes('compactConversation'), 'hard-drop compaction helper is gone')
ok(agent.includes("kind: 'context'"), 'debug channel records context slices')
ok(agent.includes('observeOmBudget'), 'debug channel records the observational budget')
ok(agent.includes('ai:om-budget'), 'the observational budget is a structured log')
ok(agent.includes('actionNeedsHumanInterrupt'), 'confirm-before-run goes through the interrupt helper')
ok(agent.includes('interruptForProposal'), 'the tool loop enters an explicit interrupt')
ok(agent.includes('resumeHitl'), 'confirm resumes the interrupt')
ok(agent.includes('cancelHitl'), 'cancel returns the interrupt to planning')
ok(agent.includes('HITL cancel'), 'debug records cancel separately from deny')
ok(agent.includes('sideEffectExecutionPermitted'), 'SSH writes check the resume gate')
ok(agent.includes('HITL interrupt'), 'debug records the interrupt phase')
ok(agent.includes('HITL resume'), 'debug records the resume phase')
ok(!agent.includes('window.confirm'), 'the planner does not use window.confirm')
ok(!agent.includes('autoApproveLowRiskCommand'), 'agent has no low-risk auto-approve branch')
ok(agent.includes('观测记忆（较早对话压缩）'), 'prompt heading names observational memory')
ok(agent.includes('相关历史回忆'), 'prompt heading names recalled history')
ok(agent.includes('工作记忆（当前目标）'), 'prompt heading names working memory')
ok(store.includes('archiveAndClearThreadContext'), 'clearing chat history archives that thread')
ok(!memory.includes('inventory-store'), 'thread memory does not import host inventory')
ok(!memory.includes('getInventoryStore'), 'thread clear does not call the inventory store')

ok(visibleWorkingGoal('  查看磁盘  ') === '查看磁盘', 'a goal collapses to one line')
ok(visibleWorkingGoal('   ') == null, 'a blank goal is hidden')
ok(visibleWorkingGoal(null) == null, 'a missing goal is hidden')
ok(visibleWorkingGoal(undefined) == null, 'an unset goal is hidden')

const npmFail = [
  'not ok 1 - add returns 3',
  '  ---',
  "  error: 'Expected values to be strictly equal token=fixture-only'",
  "  expected: '3'",
  "  actual: '1'",
  "  file: 'src/sample-add.ts'",
  '  ...'
].join('\n')
const parsedFail = parseNpmTestFailure(npmFail)
ok(parsedFail?.gate === 'npm-test', 'npm test failure is recognized')
ok(parsedFail?.name === 'add returns 3', 'npm test failure keeps the subtest name')
ok(parsedFail?.expected === '3' && parsedFail?.actual === '1', 'npm test failure keeps expected and actual')
ok(parsedFail?.file === 'src/sample-add.ts', 'npm test failure keeps the mock path')
ok(parseNpmTestFailure('ok 1 - add returns 3') == null, 'a passing line is not a gate failure')
ok(isSafeMockPath('src/sample-add.ts') === true, 'a relative mock path is safe')
ok(isSafeMockPath('../package.json') === false, 'parent traversal is not a mock path')
ok(isSafeMockPath('/etc/passwd') === false, 'an absolute path is not a mock path')

const strictTree = createMockTree({ 'src/sample-add.ts': 'export const value = 1\n' })
const strictReview = reviewNpmTestFailure(npmFail, strictTree)
ok(strictReview != null && strictReview.hitl.phase === 'interrupted', 'strict-equal failure interrupts')
ok(strictTree.writeCount() === 0, 'reviewing a failure does not write')
ok(strictReview!.draft.explanation.includes('同意') && strictReview!.draft.explanation.includes('agree'), 'explanation asks for agree in zh and en')
ok(!strictReview!.draft.explanation.includes('fixture-only'), 'explanation redacts the token')
const strictCard = patchDraftConfirmCard(strictReview!)
ok(strictCard.autoApproved === false && Boolean(strictCard.requestId), 'the confirm card is not auto-approved')
ok(strictCard.command.includes('src/sample-add.ts'), 'the confirm card shows the diff path')
const strictBlocked = applyPatchDraft(strictReview!.hitl, strictReview!.draft, strictTree)
ok(strictBlocked.applied === false && strictTree.writeCount() === 0, 'apply before agree writes nothing')
const strictDeclined = decidePatch(strictReview!, false, strictTree)
ok(strictDeclined.applied === false && strictDeclined.state.resume === 'deny', 'decline does not apply')
ok(strictTree.snapshot()['src/sample-add.ts'] === 'export const value = 1\n', 'decline leaves the mock file unchanged')
const strictAgreed = decidePatch(strictReview!, true, createMockTree({ 'src/sample-add.ts': 'export const value = 1\n' }))
ok(strictAgreed.applied === true && strictAgreed.tree.snapshot()['src/sample-add.ts'] === 'export const value = 3\n', 'agree replaces the strict-equal actual')
ok(sideEffectExecutionPermitted(strictAgreed.state) === false, 'the applied patch still cannot SSH-write')

const secretFailure = {
  gate: 'core-a-eval',
  name: 'redact',
  message: 'Bearer sk-live-SECRETVALUE missing disk fact',
  file: 'tests/fixtures/core-a/mock-s1-end.txt',
  expected: '98%',
  actual: '磁盘使用率偏高'
}
const secretText = explainGateFailure(secretFailure)
ok(secretText.includes('98%') && !secretText.includes('sk-live-SECRETVALUE'), 'explanation drops the bearer token')
ok(secretText.includes('[redacted]'), 'explanation marks the redaction')

const escapeTree = createMockTree({ '../package.json': '{}\n' })
const escapeReview = reviewGateFailure(
  { gate: 'npm-test', name: 'escape', message: 'missing 1', file: '../package.json', expected: '1', actual: '{}' },
  escapeTree
)
ok(escapeReview.draft.hunks.length === 0, 'a parent path produces no hunk')
const escapeAgreed = decidePatch(escapeReview, true, escapeTree)
ok(escapeAgreed.applied === false && escapeTree.writeCount() === 0, 'agree cannot write outside the mock root')

const stale = createMockTree({ 'src/sample-add.ts': 'export const value = 9\n' })
const staleAgreed = decidePatch(strictReview!, true, stale)
ok(staleAgreed.applied === false && stale.snapshot()['src/sample-add.ts'] === 'export const value = 9\n', 'a draft that no longer matches writes nothing')

const noteOnly = reviewGateFailure({ gate: 'npm-test', name: 'note', message: 'something broke' }, createMockTree({}))
const noteAgreed = decidePatch(noteOnly, true, createMockTree({}))
ok(noteAgreed.applied === false && noteAgreed.written.length === 0, 'an explanation-only draft writes nothing on agree')

let annotated: Error | null = null
try {
  throw annotateUnappliedFailure(new Error('S1-T1: end description missing 98%'), {
    gate: 'core-a-eval',
    name: 'S1-T1',
    message: 'end description missing 98%'
  })
} catch (error) {
  annotated = error instanceof Error ? error : new Error(String(error))
}
ok(annotated?.message.includes('A-TFL (not applied)') && annotated.message.includes('98%'), 'a failed gate carries an unapplied explanation')
ok(annotated?.message.includes('同意'), 'the unapplied note still asks before any write')

const tflSource = readFileSync(join(root, 'src/main/core-a-tfl.ts'), 'utf8')
ok(!tflSource.includes('node:fs') && !tflSource.includes('writeFile'), 'the patch loop does not touch the filesystem')
ok(!tflSource.includes('child_process') && !tflSource.includes('fetch('), 'the patch loop does not leave the process or the network')
ok(!tflSource.includes('@mastra') && !tflSource.includes('langgraph'), 'the patch loop stays on the local HITL helpers')
ok(agent.includes('actionNeedsHumanInterrupt') && !agent.includes('core-a-tfl'), 'the chat loop does not apply patch drafts itself')

const panel = readFileSync(join(root, 'src/renderer/src/components/AIPanel.tsx'), 'utf8')
const i18n = readFileSync(join(root, 'src/renderer/src/lib/i18n.tsx'), 'utf8')
// M19: the goal is an inline span in the one-row header; its slice ends at the next header control.
const goalUi = panel.slice(panel.indexOf('data-testid="ai-working-goal"'), panel.indexOf('data-testid="ai-focus-shortcut-hint"'))
ok(goalUi.length > 0 && goalUi.includes('ai-working-goal-text'), 'the goal sits in the header context row')
ok(panel.includes('workingGoal ? ('), 'the goal row is omitted when there is no goal')
ok(panel.includes('title={workingGoal}'), 'the full goal is the tooltip')
ok(panel.includes("tg('wm.goal')"), 'the row is labeled as the current goal')
ok(!goalUi.includes('<button'), 'the goal row has no button of its own')
const clearFn = panel.slice(panel.indexOf('const clearConversation'), panel.indexOf('const undoLastRound'))
ok(clearFn.includes('confirmDialog'), 'clearing the chat asks in the confirm modal')
ok(clearFn.indexOf('confirmDialog') < clearFn.indexOf('setChatHistory'), 'confirm happens before the chat is cleared')
ok(clearFn.includes("tg('wm.clearTitle')") && clearFn.includes("tg('wm.clearBody')"), 'the confirm modal names the chat clear')
ok(i18n.split("'wm.goal':").length - 1 >= 2, 'wm.goal has zh and en')
ok(i18n.split("'wm.clearTitle':").length - 1 >= 2, 'wm.clearTitle has zh and en')
ok(i18n.split("'wm.clearBody':").length - 1 >= 2, 'wm.clearBody has zh and en')

console.log(`\n---\ndone: ${n} passed`)
