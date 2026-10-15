/**
 * UX-64: assistant replies stay in card chrome, and commands never auto-run.
 * Run: npx tsx scripts/test-ux64.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commandAutoRunAllowed, highlightKeyNumbers } from '../src/shared/ai-reply-cards.ts'

let n = 0
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg)
  n++
}

const root = join(import.meta.dirname, '..')
const panel = readFileSync(join(root, 'src/renderer/src/components/AIPanel.tsx'), 'utf8')
const agent = readFileSync(join(root, 'src/main/ai-interactive-agent.ts'), 'utf8')
const form = readFileSync(join(root, 'src/renderer/src/components/AiConfigForm.tsx'), 'utf8')
const i18n = readFileSync(join(root, 'src/renderer/src/lib/i18n.tsx'), 'utf8')
const css = readFileSync(join(root, 'src/renderer/src/styles.css'), 'utf8')

const sample = '磁盘已用 **85%**（371G/466G），负载正常。'
const parts = highlightKeyNumbers(sample)
const marks = parts.filter((p) => p.kind === 'mark').map((p) => p.text)
ok(marks.includes('85%'), 'bold percent is highlighted')
ok(marks.includes('371G/466G'), 'size ratio is highlighted')
ok(parts.some((p) => p.kind === 'text' && p.text.includes('磁盘已用')), 'surrounding prose stays plain')
ok(!parts.some((p) => p.kind === 'mark' && p.text.includes('负载正常')), 'non-metrics are not a yellow wall')

const plain = highlightKeyNumbers('端口 22 正常，没有需要标黄的度量。')
ok(plain.every((p) => p.kind === 'text'), 'bare integers are not treated as metrics')

const strong = highlightKeyNumbers('请先看 **只读排查** 再决定。')
ok(strong.some((p) => p.kind === 'strong' && p.text === '只读排查'), 'bold without digits stays strong')

ok(commandAutoRunAllowed('low') === false, 'low risk cannot auto-run')
ok(commandAutoRunAllowed('high') === false, 'high risk cannot auto-run')

ok(!panel.includes('autoApproved'), 'panel does not render auto-approved commands')
ok(!panel.includes('className="msg assistant"'), 'assistant bubbles are not bare text')
ok(panel.includes('ai-structured'), 'assistant replies use card chrome')
ok(panel.includes('ux64.parseFallback'), 'parse miss has a card footnote')
ok(panel.includes('ux64.agreeRun') && panel.includes('ux64.disagree'), 'command cards keep agree and decline')
ok(panel.includes('ux64.toolAutoSnapshot'), 'snapshot tool keeps the auto strip')
ok(panel.includes('highlightKeyNumbers'), 'conclusion and plain text highlight metrics')
ok(panel.includes('data-card="streaming"') && panel.includes('data-card="error"'), 'streaming and errors are cards')

ok(!agent.includes('autoApproveLowRiskCommand'), 'agent has no low-risk auto-approve branch')
ok(!agent.includes('低风险可自动批准'), 'planner prompt no longer offers auto-approve')
ok(agent.includes("parsed.action === 'command' ? randomUUID()"), 'every command step gets a confirm id')
ok(agent.includes('await waitForAiConfirm(requestId)'), 'commands still wait for confirmation')
ok(agent.includes("toolName !== 'get_terminal_snapshot'"), 'snapshot tool path remains')

ok(!form.includes('setAutoApproveLowRisk'), 'settings checkbox for auto-run is gone')
ok(form.includes('autoApproveLowRisk: false'), 'saving settings clears the retired flag')

ok(css.includes('.ai-hl-num'), 'metric highlight style exists')
ok(css.includes('overflow-x: auto') && css.includes('.ai-reply-cmd-code'), 'command block can scroll sideways')
ok(css.includes('.ai-risk-low') && css.includes('.ai-risk-medium') && css.includes('.ai-risk-high'), 'risk badge colors remain')

const keys = [
  'ux64.risk',
  'ux64.agreeRun',
  'ux64.disagree',
  'ux64.agreeContinue',
  'ux64.toolAutoSnapshot',
  'ux64.toolNeed',
  'ux64.executed',
  'ux64.skipped',
  'ux64.streaming',
  'ux64.parseFallback',
  'ux64.emptyHint',
  'ux64.noSession',
  'ux64.copy',
  'ux64.retry',
  'ux64.clear'
]
for (const key of keys) {
  const hits = i18n.split(`'${key}':`).length - 1
  ok(hits >= 2, `${key} has zh and en`)
}

console.log(`test-ux64 ok: ${n} checks`)
