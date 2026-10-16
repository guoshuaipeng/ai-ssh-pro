import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AiAssistResult } from '@shared/ipc'
import { highlightKeyNumbers } from '@shared/ai-reply-cards'
import {
  normalizeSelectionExplain,
  selectionDraftChoice,
  selectionRiskClass,
  type SelectionExplainDraft,
  type SelectionRisk
} from '@shared/selection-explain'
import { useI18n } from '../lib/i18n'
import AiConfigCard from './AiConfigCard'
import Icon from './Icon'

export type SelectionExplainRequest = { id: number; sessionId: string; text: string; host?: string }

type Props = {
  request: SelectionExplainRequest
  onClose: () => void
  onOpenSettings: () => void
  /** Existing confirm path. Returns true only after the command was actually sent. */
  onAgree: (command: string, risk: SelectionRisk) => Promise<boolean>
}

function HighlightedText({ text }: { text: string }): ReactNode {
  const parts = highlightKeyNumbers(text)
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'mark' ? (
          <mark key={i} className="ai-hl-num">
            {p.text}
          </mark>
        ) : p.kind === 'strong' ? (
          <strong key={i}>{p.text}</strong>
        ) : (
          p.text
        )
      )}
    </>
  )
}

/** A6: read-only summary plus an optional command draft. Agree confirms; Disagree discards. */
export default function SelectionExplainCard({ request, onClose, onOpenSettings, onAgree }: Props) {
  const { t, locale } = useI18n()
  const [phase, setPhase] = useState<'loading' | 'unconfigured' | 'error' | 'ready'>('loading')
  const [message, setMessage] = useState('')
  const [aborted, setAborted] = useState(false)
  const [draft, setDraft] = useState<SelectionExplainDraft | null>(null)
  const [decision, setDecision] = useState<'pending' | 'agreed' | 'discarded'>('pending')
  const reqIdRef = useRef('')

  const start = useCallback(() => {
    const requestId = `a6-${request.id}-${Date.now()}`
    reqIdRef.current = requestId
    setPhase('loading')
    setAborted(false)
    setDecision('pending')
    setDraft(null)
    void window.aiss.ai
      .assist({ requestId, kind: 'explainSelection', text: request.text, host: request.host, locale })
      .then((result: AiAssistResult) => {
        if (reqIdRef.current !== requestId) return
        if (!result.ok && result.code === 'not-configured') {
          setPhase('unconfigured')
          return
        }
        if (!result.ok) {
          setMessage(result.message ?? '')
          setAborted(result.code === 'aborted')
          setPhase('error')
          return
        }
        if (result.kind !== 'explainSelection') {
          setMessage('')
          setPhase('error')
          return
        }
        const parsed = normalizeSelectionExplain(result)
        if (!parsed) {
          setMessage('')
          setPhase('error')
          return
        }
        setDraft(parsed)
        setPhase('ready')
      })
      .catch((e) => {
        if (reqIdRef.current !== requestId) return
        setMessage(e instanceof Error ? e.message : String(e))
        setPhase('error')
      })
  }, [locale, request.host, request.id, request.text])

  useEffect(() => {
    start()
    return () => {
      if (reqIdRef.current) void window.aiss.ai.abortAssist(reqIdRef.current)
      reqIdRef.current = ''
    }
  }, [start])

  const stop = () => {
    const id = reqIdRef.current
    reqIdRef.current = ''
    if (id) void window.aiss.ai.abortAssist(id)
    setAborted(true)
    setPhase('error')
  }

  const agree = (command: string, risk: SelectionRisk) => {
    const choice = selectionDraftChoice('agree')
    if (!choice.confirm || choice.write) return
    void onAgree(command, risk).then((ok) => {
      if (ok) setDecision('agreed')
    })
  }

  const disagree = () => {
    const choice = selectionDraftChoice('disagree')
    if (choice.write || choice.confirm) return
    setDecision('discarded')
  }

  return (
    <section className="a6-card" data-testid="a6-card" aria-live="polite">
      <header className="a6-card-head">
        <span>
          <Icon name="sparkles" size={14} /> {t('a6.title')}
        </span>
        <button type="button" className="modal-close" aria-label={t('common.close')} onClick={onClose}>
          ×
        </button>
      </header>
      {phase === 'loading' ? (
        <div className="ai-assist-loading" data-testid="a6-loading">
          <div className="ai-skeleton" />
          <div className="ai-assist-row">
            <span>{t('a6.analyzing')}</span>
            <button type="button" onClick={stop}>
              {t('a1.stop')}
            </button>
          </div>
        </div>
      ) : null}
      {phase === 'unconfigured' ? (
        <div data-testid="a6-unconfigured">
          <AiConfigCard context={t('ux37.needSelection')} onConfigure={onOpenSettings} />
        </div>
      ) : null}
      {phase === 'error' ? (
        <div className="ai-assist-error" data-testid="a6-error">
          <span>{aborted ? t('a1.stopped') : t('a1.failed', { msg: message })}</span>
          <button type="button" onClick={start}>
            {t('upd.retry')}
          </button>
        </div>
      ) : null}
      {phase === 'ready' && draft ? (
        <>
          {draft.summary ? (
            <div className="msg assistant ai-structured ai-dark-card" data-testid="ai-reply-card" data-card="conclusion" data-readonly="true">
              <h4 className="ai-reply-notes">{t('a6.summary')}</h4>
              <div className="ai-reply-desc" data-testid="a6-summary">
                <HighlightedText text={draft.summary} />
              </div>
              {draft.notes ? (
                <div className="ai-reply-notes">
                  <HighlightedText text={draft.notes} />
                </div>
              ) : null}
              <p className="ai-reply-notes">{t('a6.readonly')}</p>
            </div>
          ) : null}
          {draft.command ? (
            <div
              className="msg assistant ai-structured ai-dark-card"
              data-testid="ai-reply-card"
              data-card="command"
              data-auto-run="false"
            >
              <div className="ai-card-head">
                <div className={`ai-risk-badge ${selectionRiskClass(draft.riskLevel)}`} data-risk={draft.riskLevel}>
                  {t('ux64.risk', { level: draft.riskLevel })}
                </div>
              </div>
              <div className="ai-reply-desc">{t('a6.draft')}</div>
              <div className="ai-reply-cmd">
                <code className="ai-reply-cmd-code">{draft.command}</code>
                {decision === 'agreed' ? (
                  <div className="ai-decision" data-testid="a6-agreed">
                    {t('ux64.executed')}
                  </div>
                ) : decision === 'discarded' ? (
                  <div className="ai-decision" data-testid="a6-discarded">
                    {t('ux64.skipped')}
                  </div>
                ) : (
                  <div className="ai-reply-actions">
                    <button
                      type="button"
                      className="ai-fill-cmd-btn ai-btn-agree"
                      data-testid="a6-agree"
                      onClick={() => agree(draft.command!, draft.riskLevel)}
                    >
                      {t('ux64.agreeRun')}
                    </button>
                    <button
                      type="button"
                      className="ai-fill-cmd-btn ai-btn-decline"
                      data-testid="a6-disagree"
                      title={t('ux64.disagree')}
                      onClick={disagree}
                    >
                      <span className="ai-btn-text">{t('ux64.disagree')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
