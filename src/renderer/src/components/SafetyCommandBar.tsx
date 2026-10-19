import { useEffect, useRef } from 'react'
import type { SafetyMode, SafetySettings } from '@shared/safety-tier'
import {
  effectiveSafetyTier,
  isInteractiveCommand,
  planCommandConfirm,
  safetyTierEngaged,
  sessionInFlightBook
} from '@shared/safety-tier'
import { askConfirm } from '../lib/dialogs'
import { tg } from '../lib/i18n'

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
  settings,
  agreeLabel,
  onAgree,
  onDecline,
  onAskAgain
}: Props) {
  const book = sessionInFlightBook(sessionKey)
  const engaged = safetyTierEngaged(settings)
  const local = engaged
    ? planCommandConfirm({
        tier: effectiveSafetyTier(settings, { hostId, sessionId: sessionKey }),
        command,
        riskLevel,
        production,
        hostId,
        hostName,
        allowHosts: settings.autopilotAllowHosts,
        allowHighRisk: settings.autopilotAllowHighRisk === true,
        book
      })
    : null
  const mode: SafetyMode | 'agree' = safetyMode ?? local?.mode ?? 'agree'
  const alternative = local?.alternative
  const warn = local?.warn === true

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
    if (isInteractiveCommand(command)) book.note(command)
    onAgree(command)
  }

  return (
    <div className="ai-reply-actions" data-testid="safety-actions" data-safety={mode}>
      {warn ? <span className="ai-decision">{tg('safety.warnProd')}</span> : null}
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
