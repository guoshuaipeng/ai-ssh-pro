import { useState } from 'react'
import { formatExecDuration, type ExecRecord } from '@shared/ai-exec-replay'
import { tg, useI18n } from '../lib/i18n'
import Icon from './Icon'

export const OPEN_AUDIT_EVENT = 'aiss-open-audit'

/** 2.3 对话内执行回放：命令卡片下的一行状态，可展开查看输出摘要，并跳转到审计记录。 */
export default function ExecReplay({ exec }: { exec: ExecRecord }) {
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)
  const blocked = exec.status === 'blocked'
  const lines = exec.outputLines ?? 0
  const shown = exec.summary ? exec.summary.split('\n').length : 0
  const statusLabel = tg(`exec.status.${exec.status}` as 'exec.status.ok')
  const statusText =
    exec.status === 'failed' && typeof exec.exitCode === 'number' ? `${statusLabel} · ${tg('exec.exit', { code: exec.exitCode })}` : statusLabel
  const auditTip = exec.auditId ? tg('exec.auditTip') : tg('exec.auditMissing')
  return (
    <div className={`ai-exec-replay is-${exec.status}${open ? ' is-open' : ''}`} data-testid="ai-exec-replay" data-status={exec.status}>
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
        <button
          type="button"
          className={`ai-exec-audit${exec.auditId ? '' : ' is-muted'}`}
          data-testid="ai-exec-audit"
          aria-disabled={exec.auditId ? undefined : true}
          title={auditTip}
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_AUDIT_EVENT, { detail: { id: exec.auditId } }))}
        >
          <Icon name="scroll-text" size={12} />
          <span>{tg('exec.audit')}</span>
        </button>
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
          {exec.status === 'sent' ? <div className="ai-exec-note">{tg('exec.sentNote')}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
