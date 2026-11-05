/** R20: working-memory / observational evidence visibility (honest, capped). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMemoryEvidenceView, visibleWorkingGoal } from '../src/shared/working-memory-view'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(visibleWorkingGoal('  排查 502  '), '排查 502')
assert.equal(visibleWorkingGoal('   '), null)

const empty = buildMemoryEvidenceView({})
assert.equal(empty.goal, null)
assert.equal(empty.count, 0)
assert.equal(empty.summaryLine, null)

const view = buildMemoryEvidenceView({
  goal: '排查 nginx 502',
  hostFacts: ['web-01 / 10.0.0.8', 'dup'],
  observations: ['df：/ 使用 91%', { text: 'nginx inactive (dead)' }, ''],
  recentCommands: ['systemctl status nginx --no-pager', 'ps aux'],
  maxItems: 3,
  maxChars: 48
})
assert.equal(view.goal, '排查 nginx 502')
assert.equal(view.count, 3, 'capped at 3 — not a dump')
assert.ok(view.items.every((it) => it.text.length <= 48))
assert.equal(view.items[0].kind, 'hostFact')
assert.ok(view.summaryLine && view.summaryLine.includes('web-01'))

const long = buildMemoryEvidenceView({
  observations: ['x'.repeat(80)],
  maxItems: 1,
  maxChars: 20
})
assert.equal(long.count, 1)
assert.ok(long.items[0].text.endsWith('…'))
assert.ok(long.items[0].text.length <= 20)

assert.equal(translate('zh-CN', 'wm.memory'), '记忆')
assert.equal(translate('zh-CN', 'wm.memoryTitle'), '本会话记得')
assert.equal(translate('zh-CN', 'wm.hostFact'), '主机线索')
assert.equal(translate('zh-CN', 'wm.observation'), '观测')
assert.equal(translate('zh-CN', 'wm.recentCommand'), '近令')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('buildMemoryEvidenceView'))
assert.ok(panel.includes('data-testid="ai-memory-chip"'))
assert.ok(panel.includes('data-testid="ai-memory-pop"'))
assert.ok(panel.includes('data-testid="ai-memory-list"'))
assert.ok(panel.includes("detail?.op === 'aiMemoryEvidence'"))
assert.ok(panel.includes('getMemorySnapshot'))
assert.ok(panel.includes("tg('wm.memory')"))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R20 Round20: working-memory'))
assert.ok(css.includes('.ai-panel .ai-memory-chip'))
assert.ok(css.includes('.ai-panel .ai-memory-pop'))
const start = css.indexOf('R20 Round20: working-memory')
const end = css.indexOf('\n.ai-panel .ai-header-shortcut', start)
const block = css.slice(start, end > start ? end : start + 2000)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R20 memory CSS')

const main = norm('src/main/core-a-memory.ts')
assert.ok(main.includes('export function getWorkingMemorySnapshot'))
assert.ok(main.includes('observationalMemory'))

const idx = norm('src/main/index.ts')
assert.ok(idx.includes("ai:workingMemory:snapshot"))
assert.ok(idx.includes('getWorkingMemorySnapshot'))

const preload = norm('src/preload/index.ts')
assert.ok(preload.includes('getMemorySnapshot'))
assert.ok(preload.includes("ai:workingMemory:snapshot"))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiMemoryEvidence'"))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiMemoryEvidence'))

console.log('test-r20-memory-visibility: ok')
