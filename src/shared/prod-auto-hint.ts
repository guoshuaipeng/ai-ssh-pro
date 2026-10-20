/**
 * 路线图 2.4：生产主机 + 自动执行的横幅提示。
 * 生产环境不再限制 AI 策略（M25 决策），因此当实际生效策略为「自动执行」时，横幅需额外说明，只提醒、不拦截。
 */
import type { ResolvedAiPolicy } from './ai-policy'

export type ProdAutoHint = {
  source: ResolvedAiPolicy['source']
  /** 自动执行同时放开了高危命令 */
  autoHighRisk: boolean
}

export function prodAutoHint(input: {
  level: 'normal' | 'production' | 'readonly'
  /** 临时解除保护期间横幅显示倒计时，不叠加策略提示 */
  paused: boolean
  policy: Pick<ResolvedAiPolicy, 'effective' | 'source' | 'autoHighRisk'>
}): ProdAutoHint | null {
  if (input.level !== 'production' || input.paused) return null
  if (input.policy.effective !== 'auto') return null
  return { source: input.policy.source, autoHighRisk: input.policy.autoHighRisk }
}

/** AI 面板监听此事件，打开输入框上的执行策略菜单 */
export const OPEN_AI_POLICY_EVENT = 'aiss-open-ai-policy'
