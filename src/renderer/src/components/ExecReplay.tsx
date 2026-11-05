import { useState } from 'react'
import {
  buildFailureEvidenceView,
  formatExecDuration,
  type ExecRecord
} from '@shared/ai-exec-replay'
import { tg, useI18n } from '../lib/i18n'
import Icon from './Icon'

export const OPEN_AUDIT_EVENT = 'aiss-open-audit'

/** Round 17: inverse of OPEN_AUDIT_EVENT — audit row → AI dialog step. */
export const OPEN_AI_FROM_AUDIT_EVENT = 'aiss-open-ai-from-audit'

export type OpenAiFromAuditDetail = {
  id?: string
  host?: string
  text?: string
  tabNo?: number
}

export type OpenAuditDetail = {
  id?: string
  host?: string
  source?: 'AI' | 'user' | 'terminal' | 'snippet' | 'batch' | 'broadcast' | 'playbook' | 'sftp' | ''
  type?: string
  text?: string
}

/** 2.3 对话内执行回放：命令卡片下的一行状态，可展开查看输出摘要，并跳转到审计记录。 */
export default function ExecReplay({
  exec,
  host,
  command,
  busy = false,
  onRetryWithEvidence
}: {
  exec: ExecRecord
  /** Bound host label used when the audit row was written (filters the audit tab). */
  host?: string
  /** Command text for text filter when auditId is missing. */
  command?: string
  /** Disable retry while a turn is in flight. */
  busy?: boolean
  /**
   * Round 21 / S27: start a NEW ask that cites evidence.
   * Must not write SSH or call confirmStep — retry needs a new confirm.
   */
  onRetryWithEvidence?: (input: { command: string; evidence: string; exhausted: boolean }) => void
}) {
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)
  const blocked = exec.status === 'blocked'
  const lines = exec.outputLines ?? 0
  const shown = exec.summary ? exec.summary.split('\n').length : 0
  const failureView = buildFailureEvidenceView(exec, command)
  const statusLabel = tg(`exec.status.${exec.status}` as 'exec.status.ok')
  // Round 23: when the failure pin owns the story, do not re-shout 「失败 · exit」.
  const statusText = failureView
    ? tg('fail.statusQuiet')
    : exec.status === 'failed' && typeof exec.exitCode === 'number'
      ? `${statusLabel} · ${tg('exec.exit', { code: exec.exitCode })}`
      : statusLabel
  const canJump = Boolean(exec.auditId || host || (command && command.trim()))
  const auditTip = exec.auditId ? tg('exec.auditTip') : canJump ? tg('exec.auditFilterTip') : tg('exec.auditMissing')
  const openAudit = () => {
    if (!canJump) return
    const detail: OpenAuditDetail = {
      id: exec.auditId,
      host: host || undefined,
      source: 'AI',
      type: 'command',
      text: command?.trim() || undefined
    }
    window.dispatchEvent(new CustomEvent(OPEN_AUDIT_EVENT, { detail }))
  }
  const kindLabel = failureView?.kind ? tg(`fail.kind.${failureView.kind}` as 'fail.kind.nonzero') : null
  return (
    <div className={`ai-exec-replay is-${exec.status}${open ? ' is-open' : ''}${failureView ? ' has-failure-pin' : ''}`} data-testid="ai-exec-replay" data-status={exec.status} data-failure-deduped={failureView ? '1' : undefined}>
      {failureView ? (
        <div
          className={`ai-failure-evidence${failureView.exhausted ? ' is-exhausted' : ''}`}
          data-testid="ai-failure-evidence"
          data-kind={failureView.kind || undefined}
          data-exhausted={failureView.exhausted ? '1' : '0'}
        >
          <div className="ai-failure-evidence-head">
            <span className="ai-failure-evidence-title" data-testid="ai-failure-title">
              {tg('fail.title')}
            </span>
            {kindLabel ? (
              <span className="ai-failure-evidence-kind" data-testid="ai-failure-kind">
                {kindLabel}
              </span>
            ) : null}
            {failureView.budget ? (
              <span className="ai-failure-evidence-budget" data-testid="ai-failure-budget">
                {failureView.exhausted
                  ? tg('fail.budgetExhausted')
                  : tg('fail.budget', { n: failureView.budget.count, cap: failureView.budget.cap })}
              </span>
            ) : null}
          </div>
          <pre className="ai-failure-evidence-body" data-testid="ai-failure-body">
            {failureView.evidence}
          </pre>
          <div className="ai-failure-evidence-note" data-testid="ai-failure-note">
            {failureView.exhausted ? tg('fail.noRetryBudget') : tg('fail.noAutoRetry')}
          </div>
          <div className="ai-reply-actions ai-failure-evidence-actions">
            <button
              type="button"
              className="ai-fill-cmd-btn ai-btn-agree"
              data-testid="ai-failure-retry"
              disabled={busy}
              title={failureView.exhausted ? tg('fail.retryExhaustedTip') : tg('fail.retryTip')}
              onClick={() =>
                onRetryWithEvidence?.({
                  command: (command || '').trim(),
                  evidence: failureView.evidence,
                  exhausted: failureView.exhausted
                })
              }
            >
              <span className="ai-btn-text">{failureView.exhausted ? tg('fail.askDifferent') : tg('fail.retry')}</span>
            </button>
            <button
              type="button"
              className="ai-fill-cmd-btn"
              data-testid="ai-failure-toggle-output"
              title={open ? tg('exec.collapse') : tg('exec.expand')}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? tg('fail.hideOutput') : tg('fail.showOutput')}
            </button>
            <button
              type="button"
              className={`ai-fill-cmd-btn${canJump ? '' : ' is-muted'}`}
              data-testid="ai-failure-audit"
              aria-disabled={canJump ? undefined : true}
              title={auditTip}
              onClick={openAudit}
            >
              {tg('exec.audit')}
            </button>
          </div>
        </div>
      ) : null}
      <div className="ai-exec-row">
        <button
          type="button"
          className="ai-exec-toggle"
          aria-expanded={open}
          data-testid="ai-exec-toggle"
          title={`${open ? tg('exec.collapse') : tg('exec.expand')}\n${new Date(exec.at).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}`}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
          <span className="ai-exec-dot" aria-hidden />
          <span className="ai-exec-status">{statusText}</span>
          {!blocked ? <span className="ai-exec-meta">{tg('exec.duration', { d: formatExecDuration(exec.durationMs, locale === 'en' ? 'en' : 'zh') })}</span> : null}
          {!blocked ? <span className="ai-exec-meta">{lines ? tg('exec.lines', { n: lines }) : tg('exec.noOutputShort')}</span> : null}
        </button>
        {failureView ? null : (
          <button
            type="button"
            className={`ai-exec-audit${canJump ? '' : ' is-muted'}`}
            data-testid="ai-exec-audit"
            aria-disabled={canJump ? undefined : true}
            title={auditTip}
            onClick={openAudit}
          >
            <Icon name="scroll-text" size={12} />
            <span>{tg('exec.audit')}</span>
          </button>
        )}
      </div>
      {open ? (
        <div className="ai-exec-body" data-testid="ai-exec-body">
          {blocked ? (
            <div className="ai-exec-note">{tg('exec.blockedNote')}</div>
          ) : exec.summary ? (
            <>
              <pre className="ai-exec-output">{exec.summary}</pre>
              {lines > shown ? <div className="ai-exec-note">{tg('exec.tailNote', { n: shown, total: lines })}</div> : null}
            </>
          ) : (
            <div className="ai-exec-note">{tg('exec.noOutput')}</div>
          )}
          {exec.status === 'sent' ? (
            <div className="ai-exec-note" data-testid="ai-exec-noexit">
              {exec.noExit === 'timeout'
                ? tg('exec.noExit.timeout')
                : exec.noExit === 'unsupported'
                  ? tg('exec.noExit.unsupported')
                  : exec.noExit === 'ineligible'
                  ? tg('exec.noExit.ineligible')
                  : exec.noExit === 'disabled'
                    ? tg('exec.noExit.disabled')
                    : tg('exec.sentNote')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
