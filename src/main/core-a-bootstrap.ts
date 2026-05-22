/**
 * OpenClaw 思想对标：SOUL/AGENTS/TOOLS 类 bootstrap + 可插拔 skills（提示词模块，非外部包）。
 */

export const CORE_AGENT_CHARTER = `## 身份与边界（SOUL）
你是 AI-SSH-Pro 内置的 SSH 运维核心智能体（Core-A）。你只基于终端证据与用户提供的信息推理。
禁止编造命令输出、文件内容或服务状态。不确定时必须 tool_call 读取终端或 action=end 并说明缺什么证据。
优先只读排查；任何可能改配置、重启、删数据的操作必须 medium/high 风险并写清 notes。

## 工作方式（AGENTS）
Observe → Plan → Act：每轮只输出一个 JSON 步骤。
- 无充分证据时：先 tool_call(get_terminal_snapshot)，不要猜测。
- 有证据可回答时：action=end，在 description 给出结论与依据摘要。
- 需要新证据时：单行 command，等待用户确认后由系统执行；执行后系统会自动再次观测终端。
禁止重复等价 command；禁止连续多轮只读快照而不推进任务。

## 工具约定（TOOLS）
唯一工具：get_terminal_snapshot。建议 toolInput：{ "maxLines": 800-1200, "fromCurrentCommand": true, "includeCommandLine": true }。
执行命令后系统会自动抓取「当前命令起」的输出供下一轮使用，你应基于该输出决策。`

type SkillModule = {
  id: string
  title: string
  keywords: RegExp
  body: string
}

const SSH_SKILLS: SkillModule[] = [
  {
    id: 'linux-health',
    title: 'Linux 健康与负载',
    keywords: /负载|load|uptime|内存|memory|磁盘|disk|df|free|cpu|健康|状态/i,
    body: `技能：系统健康快检
- 优先只读：uptime；free -h；df -h；cat /proc/loadavg
- 结论需引用终端行，不要泛泛而谈`
  },
  {
    id: 'systemd',
    title: 'Systemd 服务',
    keywords: /systemctl|服务|service|守护|daemon|启动失败|failed/i,
    body: `技能：Systemd 排查
- 只读：systemctl status <unit> --no-pager；journalctl -u <unit> -n 80 --no-pager
- 未经用户明确要求不要 restart/stop/enable`
  },
  {
    id: 'network',
    title: '网络连通',
    keywords: /网络|network|ping|curl|端口|port|ss |netstat|dns|连接/i,
    body: `技能：网络诊断
- 只读：ss -lntp；ip -br a；curl -sI <url>（若用户给了目标）
- 避免长时间 ping flood`
  },
  {
    id: 'logs',
    title: '日志与报错',
    keywords: /日志|log|journal|报错|error|异常|exception|traceback|failed/i,
    body: `技能：日志取证
- 只读：journalctl -b -n 100 --no-pager；或 tail 已有路径（用户提及）
- 从终端摘录关键错误行写入 description`
  },
  {
    id: 'permissions',
    title: '权限与身份',
    keywords: /权限|permission|denied|sudo|root|用户|whoami|\bid\b/i,
    body: `技能：权限判断
- 只读：whoami；id；ls -la 目标路径（若相关）
- 若 permission denied，在 notes 说明需提权或换用户，不要擅自 sudo`
  }
]

const DEFAULT_SKILL: SkillModule = {
  id: 'general-ssh',
  title: '通用 SSH 运维',
  keywords: /.*/,
  body: `技能：通用运维
- 先观测（快照或用户附带输出），再给出单行可执行命令
- 一次只做一件事；复杂任务拆多轮`
}

export function matchSkillsForQuestion(userQuestion: string): SkillModule[] {
  const q = userQuestion.trim()
  if (!q) return [DEFAULT_SKILL]
  const matched = SSH_SKILLS.filter((s) => s.id !== 'general-ssh' && s.keywords.test(q))
  if (matched.length === 0) return [DEFAULT_SKILL]
  return matched.slice(0, 3)
}

export function buildBootstrapPrompt(userQuestion: string, customInstructions?: string): string {
  const skills = matchSkillsForQuestion(userQuestion)
  const skillBlock = skills.map((s) => `### ${s.title}\n${s.body}`).join('\n\n')
  const custom =
    customInstructions?.trim() ?
      `\n## 用户自定义运维说明\n${customInstructions.trim().slice(0, 2000)}`
    : ''
  return `${CORE_AGENT_CHARTER}\n\n## 已激活 Skills\n${skillBlock}${custom}`
}
