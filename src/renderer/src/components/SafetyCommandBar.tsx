import { useEffect, useRef } from 'react'
import type { SafetyMode, SafetySettings } from '@shared/safety-tier'
import { isAiPolicy, policyTier, resolveAiPolicy } from '@shared/ai-policy'
import { aiEffectiveLevel, type AiHostProtection } from '@shared/ai-write-guard'
import {
  isInteractiveCommand,
  planCommandConfirm,
  safetyTierEngaged,
  sessionInFlightBook
} from '@shared/safety-tier'
import { askConfirm } from '../lib/dialogs'
import { tg, type MessageKey } from '../lib/i18n'
import { assessCommandRisk } from '@shared/command-risk'

type Props = {
  command: string
  riskLevel?: string | null
  /** Agent decision. Absent on a plain suggestion, which is gated locally. */
  safetyMode?: SafetyMode
  requestId?: string
  fresh?: boolean
  decision?: 'agreed' | 'skipped'
  canRun: boolean
  confirmable?: boolean
  sessionKey?: string | null
  hostId?: string | null
  hostName?: string | null
  production?: boolean
  /** M21: host policy, per-tab temp override and protection for resolveAiPolicy. */
  hostPolicy?: string | null
  tempPolicy?: string | null
  protection?: AiHostProtection | null
  settings: SafetySettings
  agreeLabel?: string
  onAgree: (command: string) => void
  onDecline: () => void
  /** Stale Core-A confirm: fill composer with the prior ask (parent handles). */
  onAskAgain?: () => void
}

function AutoRunOnce({ command, onRun }: { command: string; onRun: (command: string) => void }) {
  const ran = useRef(false)
  const runRef = useRef(onRun)
  runRef.current = onRun
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    runRef.current(command)
  }, [command])
  return (
    <div className="ai-decision" data-testid="safety-auto">
      {tg('safety.autoRan')}
    </div>
  )
}

/** Agree / Decline, or the tier's suggest / hold / auto replacement. */
export default function SafetyCommandBar({
  command,
  riskLevel,
  safetyMode,
  requestId,
  fresh,
  decision,
  canRun,
  confirmable = true,
  sessionKey,
  hostId,
  hostName,
  production,
  hostPolicy,
  tempPolicy,
  protection,
  settings,
  agreeLabel,
  onAgree,
  onDecline,
  onAskAgain
}: Props) {
  const book = sessionInFlightBook(sessionKey)
  const engaged = safetyTierEngaged(settings) || isAiPolicy(settings.aiPolicy)
  const level = protection ?? { level: production ? ('production' as const) : ('normal' as const) }
  const policy = resolveAiPolicy({ settings, hostPolicy, tempOverride: tempPolicy, protection: level })
  const local = engaged
    ? planCommandConfirm({
        tier: policyTier(policy.effective),
        command,
        riskLevel,
        production: production || aiEffectiveLevel(level) !== 'normal',
        hostId,
        hostName,
        allowHosts: [],
        allowHighRisk: policy.autoHighRisk,
        book
      })
    : null
  const mode: SafetyMode | 'agree' = safetyMode ?? local?.mode ?? 'agree'
  const alternative = local?.alternative
  const warn = local?.warn === true
  // D48: even with the safety tier off, a locally high-risk command (rm -rf, mkfs, dd, ...) shows why and asks once
  const localRisk = assessCommandRisk(command)
  const needsRiskConfirm = Boolean(localRisk) && mode !== 'strong'

  if (decision === 'agreed' || mode === 'auto' && safetyMode === 'auto') {
    return (
      <div className="ai-decision" data-testid="safety-auto">
        {tg(safetyMode === 'auto' ? 'safety.autoRan' : 'ux64.executed')}
      </div>
    )
  }
  if (decision === 'skipped') {
    return <div className="ai-decision">{tg('ux64.skipped')}</div>
  }
  if (mode === 'suggest') {
    return (
      <div className="ai-decision" data-testid="safety-suggest">
        {tg('safety.suggest')}
      </div>
    )
  }
  if (mode === 'hold' || book.holds(command)) {
    return (
      <div className="ai-decision" data-testid="safety-hold">
        {tg('safety.inflight')}
      </div>
    )
  }
  if (mode === 'auto') {
    if (fresh && canRun && !requestId) {
      return <AutoRunOnce command={command} onRun={onAgree} />
    }
    if (!canRun) {
      return <div className="ai-decision">{tg('ux64.noSession')}</div>
    }
    return (
      <div className="ai-decision" data-testid="safety-auto">
        {tg('safety.autoRan')}
      </div>
    )
  }

  if (requestId && !confirmable && !decision) {
    return (
      <div className="ai-reply-actions ai-stale-actions" data-testid="ai-confirm-stale">
        <span className="ai-decision">{tg('ux64.confirmStale')}</span>
        {onAskAgain ? (
          <button type="button" className="ai-fill-cmd-btn" data-testid="ai-ask-again" onClick={onAskAgain}>
            {tg('ux64.askAgain')}
          </button>
        ) : null}
      </div>
    )
  }

  const disabled = !confirmable || !canRun
  const agree = async () => {
    if (book.holds(command)) return
    if (mode === 'strong') {
      const ok = await askConfirm({
        id: 'confirm.dangerCommand',
        title: tg('safety.strong'),
        body: command,
        danger: true,
        confirmText: tg('ux64.agreeRun')
      })
      if (!ok) {
        onDecline()
        return
      }
    }
    if (needsRiskConfirm && localRisk) {
      const ok = await askConfirm({
        id: 'confirm.dangerCommand',
        title: tg('d48.title', { reason: tg(localRisk.reasonKey as MessageKey) }),
        body: command,
        danger: true,
        confirmText: tg('ux64.agreeRun')
      })
      if (!ok) return
    }
    if (isInteractiveCommand(command)) book.note(command)
    onAgree(command)
  }

  return (
    <div className="ai-reply-actions" data-testid="safety-actions" data-safety={mode}>
      {warn ? <span className="ai-decision">{tg('safety.warnProd')}</span> : null}
      {localRisk ? (
        <span className="ai-decision ai-risk-local" data-testid="ai-risk-local">
          {tg('d48.risk', { reason: tg(localRisk.reasonKey as MessageKey) })}
        </span>
      ) : null}
      {alternative ? <span className="ai-decision">{tg('safety.alt', { cmd: alternative })}</span> : null}
      <span className="ai-btn-wrap" title={!canRun ? tg('ux64.noSession') : undefined}>
        <button type="button" className="ai-fill-cmd-btn ai-btn-agree" disabled={disabled} onClick={() => void agree()}>
          {agreeLabel ?? tg('ux64.agreeRun')}
        </button>
      </span>
      <button
        type="button"
        className="ai-fill-cmd-btn ai-btn-decline"
        disabled={!confirmable}
        title={tg('ux64.disagree')}
        onClick={onDecline}
      >
        <span className="ai-btn-text">{tg('ux64.disagree')}</span>
      </button>
    </div>
  )
}
