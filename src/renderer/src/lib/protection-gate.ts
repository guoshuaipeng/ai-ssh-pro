import { appendAudit, appendGate, type AuditOutcome, type GateResult, type GateRule } from '@shared/audit-log'
import { decideWrite, hostNameMatches, type ProtectionLevel, type WriteChannel } from '@shared/protection'
import { askConfirm, promptDialog, toast } from './dialogs'
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
  alertId?: string
  playbookId?: string
  demo?: boolean
}

function gateRuleFor(opts: GuardRequest): GateRule {
  if (opts.channel === 'sftp') return 'sftp'
  if (opts.level === 'readonly') return opts.dangerous ? 'danger' : 'readonlyWrite'
  if (opts.level === 'production') return 'prod'
  return 'danger'
}

function gateResultFor(decision: string, ok: boolean, outcome: AuditOutcome): GateResult {
  if (decision === 'block' || outcome === 'blocked') return 'blocked'
  if (!ok) return 'cancelled'
  if (decision.startsWith('confirm')) return 'confirmed'
  return 'allowed'
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
    outcome = 'blocked'
  } else if (decision === 'confirm-danger') {
    ok = await askConfirm({
      id: 'confirm.dangerCommand',
      title: tg('risk.title'),
      body: `${opts.dangerReason || tg('l4.dangerBody')}\n\n${opts.command}`,
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
      ok = await askConfirm({
        id: 'confirm.dangerCommand',
        title: tg('risk.title'),
        body: `${opts.dangerReason || tg('l4.dangerBody')}\n\n${opts.command}`,
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
    ok = await askConfirm({
      id: 'confirm.dangerCommand',
      title: tg('a1.runOn', { host }),
      body: opts.command,
      confirmText: tg('a1.run'),
      danger: true
    })
    outcome = ok ? 'allowed' : 'cancelled'
  } else {
    ok = true
    outcome = 'allowed'
  }

  const shouldRecord = decision !== 'allow' || opts.channel === 'sftp' || opts.dangerous
  if (shouldRecord) {
    const row = appendGate({
      host: host,
      hostKey: opts.profileId,
      protection: opts.level,
      gateRule: gateRuleFor(opts),
      gateResult: gateResultFor(decision, ok, outcome),
      summary: `${opts.command}`.slice(0, 180),
      alertId: opts.alertId,
      playbookId: opts.playbookId,
      demo: opts.demo,
      source: opts.source === 'AI' ? 'AI' : 'user'
    })
    if (outcome === 'blocked') {
      toast({
        text: tg('l4.readonlyBlocked'),
        action: {
          label: tg('s2b.why'),
          run: () => window.dispatchEvent(new CustomEvent('aiss-open-gate', { detail: { id: row.id, hostKey: opts.profileId } }))
        }
      })
    }
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
