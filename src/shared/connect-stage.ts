/** D77b: SSH connect stages reported by main while a tab is connecting. */
export type ConnectStage = 'tcp' | 'handshake' | 'auth' | 'shell'

export type ConnectStageEvent = {
  /** `${host}:${port}` of the final target (same for every hop of one connect). */
  target: string
  stage: ConnectStage
  /** Set while a jump hop is being connected (1-based). */
  hop?: number
  hopTotal?: number
}

export const STAGE_ORDER: ConnectStage[] = ['tcp', 'handshake', 'auth', 'shell']

export function stageTarget(host: string, port: number | undefined): string {
  return `${host.trim()}:${port ?? 22}`
}

/** True when the error looks like a handshake/ready timeout. */
export function isConnectTimeout(msg: string): boolean {
  return /timed out|timeout|ETIMEDOUT/i.test(msg)
}

/** Suffix naming the stage a timeout got stuck in; '' when not a timeout. */
export function stageTimeoutSuffix(msg: string, stage: ConnectStage | undefined, label: (s: ConnectStage) => string): string {
  if (!stage || !isConnectTimeout(msg)) return ''
  return label(stage)
}
