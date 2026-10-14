import { assessCommandRisk } from '@shared/command-risk'
import { confirmDialog, toast } from './dialogs'
import { tg, type MessageKey } from './i18n'
import { fillCommandBar, noteSubmitted } from './ai-events'
import { notifyHistoryChanged } from './workspace-events'

/**
 * Every AI-generated command goes through here (A1 Run / A2 Enter):
 * fill the command bar first, then confirm "Run on {host}?"; dangerous commands get the red interception dialog
 * whose button reads "Run anyway". Returns true when the command was sent.
 */
export async function confirmAndRunAiCommand(opts: {
  sessionId: string
  command: string
  host?: string
  aiRisk?: 'safe' | 'caution' | 'danger'
}): Promise<boolean> {
  const { sessionId, command } = opts
  fillCommandBar(sessionId, command)
  const local = assessCommandRisk(command)
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
