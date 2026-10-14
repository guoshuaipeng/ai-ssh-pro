import { assessCommandRisk } from '@shared/command-risk'
import { decideWrite, type ProtectionLevel, type WriteChannel } from '@shared/protection'
import { confirmDialog, toast } from './dialogs'
import { tg, type MessageKey } from './i18n'
import { fillCommandBar, noteSubmitted } from './ai-events'
import { runGuardedCommand } from './protection-gate'
import { notifyHistoryChanged } from './workspace-events'

/**
 * Every AI-generated command goes through here (A1 Run / A2 Enter):
 * fill the command bar first, then the protection gate. A silent allow still confirms
 * "Run on {host}?". Dangerous commands get the red dialog ("Run anyway"); production
 * danger types the host name first. Returns true when the command was sent.
 */
export async function confirmAndRunAiCommand(opts: {
  sessionId: string
  command: string
  host?: string
  aiRisk?: 'safe' | 'caution' | 'danger'
  /** S2: when set, send goes through the host protection gate. Insert still happens first. */
  protection?: {
    level: ProtectionLevel
    hostName: string
    elevated: boolean
    profileId?: string
    channel: WriteChannel
  }
}): Promise<boolean> {
  const { sessionId, command } = opts
  fillCommandBar(sessionId, command)
  const local = assessCommandRisk(command)
  const dangerous = Boolean(local) || opts.aiRisk === 'danger'
  if (opts.protection) {
    const decision = decideWrite(opts.protection.level, {
      dangerous,
      elevated: opts.protection.elevated,
      channel: opts.protection.channel
    })
    const allowed = await runGuardedCommand({
      level: opts.protection.level,
      hostName: opts.protection.hostName,
      hostLabel: opts.host,
      elevated: opts.protection.elevated,
      profileId: opts.protection.profileId,
      channel: opts.protection.channel,
      dangerous,
      dangerReason: local ? tg(local.reasonKey as MessageKey) : tg('a2.riskDanger'),
      command,
      source: 'AI'
    })
    if (!allowed) return false
    // Normal safe commands, and production safe command-bar lines, pass the gate
    // without a dialog. AI still asks "Run on {host}?" (A1). Host-name and danger
    // dialogs already confirmed.
    if (decision === 'allow') {
      const ok = await confirmDialog({
        title: tg('a1.runOn', { host: opts.host || tg('a1.thisHost') }),
        detail: command,
        confirmText: tg('a1.run')
      })
      if (!ok) return false
    }
  } else {
    let ok: boolean
    if (local || opts.aiRisk === 'danger') {
      const reason = local ? tg(local.reasonKey as MessageKey) : tg('a2.riskDanger')
      ok = await confirmDialog({
        title: tg('risk.title'),
        body: tg('risk.hint', { reason }),
        detail: command,
        danger: true,
        confirmText: tg('risk.run')
      })
      if (!ok) toast({ text: tg('risk.blocked') })
    } else {
      ok = await confirmDialog({
        title: tg('a1.runOn', { host: opts.host || tg('a1.thisHost') }),
        detail: command,
        confirmText: tg('a1.run')
      })
    }
    if (!ok) return false
  }
  try {
    await window.aiss.workspace.commandHistory.push(command)
    notifyHistoryChanged()
  } catch {
    /* history is best effort */
  }
  noteSubmitted(sessionId, command)
  const sent = await window.aiss.ssh.write(sessionId, `${command}\r`)
  if (!sent) toast({ text: tg('history.sendFailed'), kind: 'error' })
  else fillCommandBar(sessionId, '')
  return Boolean(sent)
}
