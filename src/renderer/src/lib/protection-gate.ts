import { appendAudit, type AuditOutcome } from '@shared/audit-log'
import { decideWrite, hostNameMatches, type ProtectionLevel, type WriteChannel } from '@shared/protection'
import { confirmDialog, promptDialog, toast } from './dialogs'
import { tg } from './i18n'

export type GuardRequest = {
  level: ProtectionLevel
  hostName: string
  hostLabel?: string
  elevated: boolean
  profileId?: string
  channel: WriteChannel
  dangerous: boolean
  dangerReason?: string
  command: string
  source: 'AI' | 'user'
}

/** Dialogs + S1 events for one write. Returns true when the caller may send. */
export async function runGuardedCommand(opts: GuardRequest): Promise<boolean> {
  const decision = decideWrite(opts.level, {
    dangerous: opts.dangerous,
    elevated: opts.elevated,
    channel: opts.channel
  })
  const host = opts.hostLabel || opts.hostName
  let ok = false
  let outcome: AuditOutcome = 'cancelled'

  if (decision === 'block') {
    toast({ text: tg('l4.readonlyBlocked') })
    outcome = 'blocked'
  } else if (decision === 'confirm-danger') {
    ok = await confirmDialog({
      title: tg('risk.title'),
      body: opts.dangerReason || tg('l4.dangerBody'),
      detail: opts.command,
      danger: true,
      confirmText: tg('risk.run')
    })
    outcome = ok ? 'allowed' : 'cancelled'
    if (!ok) toast({ text: tg('risk.blocked') })
  } else if (decision === 'confirm-host' || decision === 'confirm-host-danger') {
    const typed = await promptDialog({
      title: tg('l4.runOn', { host }),
      label: tg('l4.typeHost', { host: opts.hostName }),
      validate: (v) => (hostNameMatches(v, [opts.hostName, opts.hostLabel]) ? null : tg('l4.hostMismatch'))
    })
    if (typed == null) {
      outcome = 'cancelled'
    } else if (decision === 'confirm-host-danger') {
      ok = await confirmDialog({
        title: tg('risk.title'),
        body: opts.dangerReason || tg('l4.dangerBody'),
        detail: opts.command,
        danger: true,
        confirmText: tg('risk.run')
      })
      outcome = ok ? 'allowed' : 'cancelled'
      if (!ok) toast({ text: tg('risk.blocked') })
    } else {
      ok = true
      outcome = 'allowed'
    }
  } else if (opts.channel === 'alert') {
    ok = await confirmDialog({
      title: tg('a1.runOn', { host }),
      detail: opts.command,
      confirmText: tg('a1.run')
    })
    outcome = ok ? 'allowed' : 'cancelled'
  } else {
    ok = true
    outcome = 'allowed'
  }

  if (opts.channel === 'alert') {
    appendAudit({
      type: 'alert.execute',
      host,
      profileId: opts.profileId,
      source: opts.source,
      outcome,
      detail: opts.command
    })
  }
  if (opts.dangerous || outcome === 'blocked') {
    appendAudit({
      type: 'danger',
      host,
      profileId: opts.profileId,
      source: opts.source,
      outcome,
      detail: opts.command
    })
  }
  return ok
}
