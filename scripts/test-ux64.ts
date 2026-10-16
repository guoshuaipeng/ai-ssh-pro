/**
 * UX-64: assistant replies stay in card chrome, and commands never auto-run.
 * Run: npx tsx scripts/test-ux64.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { commandAutoRunAllowed, commandBundle, highlightKeyNumbers, layoutOpsReply, softenNumberedBreaks } from '../src/shared/ai-reply-cards.ts'

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

ok(softenNumberedBreaks('结论 1) 磁盘满 2) 日志大 3) 可清理') === '结论\n1) 磁盘满\n2) 日志大\n3) 可清理', 'inline 1) 2) 3) gains real newlines')
ok(softenNumberedBreaks('1) 甲\n2) 乙') === '1) 甲\n2) 乙', 'items that already have newlines stay')
ok(softenNumberedBreaks('1. 甲 2. 乙') === '1. 甲\n2. 乙', 'period numbers break the same way')
ok(softenNumberedBreaks('端口 22 正常') === '端口 22 正常', 'a bare port is not a list item')
const broken = highlightKeyNumbers('1) 已用 **85%** 2) 结束')
ok(broken.map((p) => p.text).join('').includes('\n'), 'highlight path keeps the inserted newline')
ok(broken.some((p) => p.kind === 'mark' && p.text === '85%'), 'number highlight still marks the metric')

const wall =
  '已获取完整系统负载证据：1) uptime 显示系统已运行 328 天，属健康范围；2) free -h 显示内存存在中高内存压力；3) df -h 显示使用率 85%（超 80% 告警阈值），需关注；4) /proc/loadavg 属中等活跃度。结论：内存与 NFS 存储为当前主要瓶颈。'
const laid = layoutOpsReply(wall)
const findings = laid.blocks.filter((b) => b.kind === 'finding')
ok(findings.length === 4, 'numbered findings become separate blocks')
ok(findings[0]?.kind === 'finding' && findings[0].risk === 'low', 'a healthy finding is low')
ok(findings[1]?.kind === 'finding' && findings[1].risk === 'medium', 'memory pressure is medium')
ok(findings[2]?.kind === 'finding' && findings[2].risk === 'high', 'an alert threshold is high')
ok(laid.blocks.some((b) => b.kind === 'conclusion' && b.text.includes('瓶颈')), '结论 is its own block')
ok(laid.risk === 'high', 'the reply risk is the highest finding')
ok(!laid.blocks.some((b) => b.kind === 'commands'), 'a result write-up does not offer Agree for uptime')
ok(!softenNumberedBreaks(wall).includes('1.83') || softenNumberedBreaks('负载 1.83/1.81').includes('1.83'), 'decimals stay')
ok(softenNumberedBreaks('负载 1.83/1.81 正常') === '负载 1.83/1.81 正常', 'a decimal is not a list item')

const propose = layoutOpsReply('需执行 uptime、free -h、cat /proc/loadavg 获取核心负载证据。')
const cmds = propose.blocks.find((b) => b.kind === 'commands')
ok(cmds?.kind === 'commands' && cmds.confirm && cmds.commands.join(',') === 'uptime,free -h,cat /proc/loadavg', 'a request to run is a command strip')
ok(commandBundle(['uptime', 'free -h']) === 'uptime && free -h', 'agree joins commands and does not auto-run')
const notYet = layoutOpsReply('尚未执行 df -h 或 cat /proc/loadavg。必须先执行诊断命令。')
ok(notYet.blocks.some((b) => b.kind === 'commands' && b.confirm), '尚未执行 is still a proposal')

const shotAsk =
  '当前终端仍为空白登录提示，无负载指标。需执行 uptime、free -h、cat /proc/loadavg 获取核心负载证据。'
const shotResult =
  '已获取完整系统负载证据：1) uptime 显示系统已运行 328 天，当前 load average 为 1.83/1.81/1.97（1/5/15 分钟），低于 CPU 核心数（推测 ≤4），属健康范围；2) free -h 显示内存总 94G，已用 68G，可用 21G，swap=0B，存在中高内存压力；3) df -h 显示根分区 / 使用率 80%，NFS 挂载 /opt/palmhall/defaultBucketName 使用率 85%（超 80% 告警阈值），需关注；4) /proc/loadavg 最后字段 8293 表示当前活跃线程数，属中等活跃度。结论：CPU 负载正常，内存与 NFS 存储为当前主要瓶颈。'
const shotPending =
  '当前终端仍为空白登录提示，无任何负载相关输出。尚未执行 uptime、free -h、df -h 或 cat /proc/loadavg 等命令，因此无法获取 CPU 负载、内存使用、磁盘占用或系统平均负载等指标。所有此前声称的负载数据均基于历史会话缓存，而本轮无新证据支持，必须先执行诊断命令才能给出有效结论。'
const shotHot =
  '已获取完整系统负载证据：1) uptime 显示系统已运行 328 天，当前 load average 为 7.35/3.61/2.63（1/5/15 分钟），高于 CPU 核心数（推测 ≤4），属中高负载；2) free -h 显示内存总 94G，已用 67G，可用 22G，swap=0B，存在显著内存压力；3) df -h 显示根分区 / 使用率 79%，NFS 挂载 /opt/palmhall/defaultBucketName 使用率 85%（超 80% 告警阈值），且 overlay2 占用达 1.1T（80%）；4) /proc/loadavg 最后字段 12281 表示当前活跃线程数较高。结论：CPU 与内存为当前主要瓶颈，NFS 存储接近饱和，需优先排查高负载进程及大体量容器日志或缓存。'
const ask = layoutOpsReply(shotAsk)
const askCmds = ask.blocks.find((b) => b.kind === 'commands')
ok(askCmds?.kind === 'commands' && askCmds.confirm && askCmds.commands.join(',') === 'uptime,free -h,cat /proc/loadavg', 'a blank-terminal ask is a command strip')
ok(commandBundle(askCmds?.kind === 'commands' ? askCmds.commands : []) === 'uptime && free -h && cat /proc/loadavg', 'agree joins the three diagnostics')
const result = layoutOpsReply(shotResult)
const resultFindings = result.blocks.filter((b) => b.kind === 'finding')
ok(resultFindings.length === 4, 'screenshot result is four finding cards')
ok(resultFindings.map((b) => (b.kind === 'finding' ? b.risk : null)).join(',') === 'low,medium,high,medium', 'screenshot finding risks')
ok(result.risk === 'high' && result.blocks.some((b) => b.kind === 'conclusion' && b.text.includes('瓶颈')), 'screenshot conclusion stays high')
ok(!result.blocks.some((b) => b.kind === 'commands'), '已获取 does not offer Agree')
ok(!shotResult.includes('\n') && softenNumberedBreaks(shotResult).includes('\n1)') && softenNumberedBreaks(shotResult).includes('1.83/1.81/1.97'), 'colons break findings and decimals stay')
const pending = layoutOpsReply(shotPending)
const pendingCmds = pending.blocks.find((b) => b.kind === 'commands')
ok(pendingCmds?.kind === 'commands' && pendingCmds.confirm && pendingCmds.commands.join(',') === 'uptime,free -h,df -h,cat /proc/loadavg', '尚未执行 still proposes the four commands')
ok(!pending.blocks.some((b) => b.kind === 'finding'), 'a pending paragraph is not a fake finding list')
const hot = layoutOpsReply(shotHot)
ok(hot.blocks.filter((b) => b.kind === 'finding').length === 4, 'hot result is four finding cards')
ok(hot.risk === 'high' && !hot.blocks.some((b) => b.kind === 'commands'), 'hot result keeps the risk and no command strip')
ok(softenNumberedBreaks(shotHot).includes('1.1T') && softenNumberedBreaks(shotHot).includes('7.35/3.61/2.63'), 'overlay size and load decimals stay intact')

ok(commandAutoRunAllowed('low') === false, 'low risk cannot auto-run')
ok(commandAutoRunAllowed('high') === false, 'high risk cannot auto-run')

ok(!panel.includes('autoApproved'), 'panel does not render auto-approved commands')
ok(!panel.includes('className="msg assistant"'), 'assistant bubbles are not bare text')
ok(panel.includes('ai-structured'), 'assistant replies use card chrome')
ok(panel.includes('ux64.parseFallback'), 'parse miss has a card footnote')
ok(panel.includes('ux64.agreeRun') && panel.includes('ux64.disagree'), 'command cards keep agree and decline')
ok(panel.includes('ux64.toolAutoSnapshot'), 'snapshot tool keeps the auto strip')
ok(panel.includes('highlightKeyNumbers'), 'conclusion and plain text highlight metrics')
ok(panel.includes('layoutOpsReply'), 'plain replies layout diagnostic blocks')
ok(panel.includes('data-testid="ai-ops-finding"'), 'findings render as cards')
ok(panel.includes('ai-finding-risk'), 'each finding shows a risk badge')
ok(panel.includes('ai-reply-cmd-code'), 'proposed commands use the monospace strip')
ok(panel.includes('data-card="streaming"') && panel.includes('data-card="error"'), 'streaming and errors are cards')

ok(!agent.includes('autoApproveLowRiskCommand'), 'agent has no low-risk auto-approve branch')
ok(!agent.includes('低风险可自动批准'), 'planner prompt no longer offers auto-approve')
ok(agent.includes('needsInterrupt ? randomUUID()'), 'every command step gets a confirm id')
ok(agent.includes('actionNeedsHumanInterrupt(parsed.action, parsed.toolName)'), 'confirm id follows the interrupt helper')
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
