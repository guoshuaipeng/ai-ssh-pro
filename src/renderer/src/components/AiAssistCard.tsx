import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiAssistResult } from '@shared/ipc'
import { useI18n } from '../lib/i18n'

export type AiExplainRequest = { id: number; sessionId: string; text: string; host?: string; kind?: 'explainError' | 'explainAlert' }

type Props = {
  request: AiExplainRequest
  onClose: () => void
  onOpenSettings: () => void
  onInsert: (sessionId: string, command: string) => void
  onRun: (sessionId: string, command: string) => void
}

/** A1: "Explain with AI" result in the right-hand AI panel — cause, fix commands (Insert / Run), notes. */
export default function AiAssistCard({ request, onClose, onInsert, onRun }: Props) {
  const { t, locale } = useI18n()
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'done'; result: AiAssistResult }>({ phase: 'loading' })
  const reqIdRef = useRef('')

  const start = useCallback(() => {
    const requestId = `a1-${request.id}-${Date.now()}`
    reqIdRef.current = requestId
    setState({ phase: 'loading' })
    void window.aiss.ai
      .assist({ requestId, kind: request.kind ?? 'explainError', text: request.text, host: request.host, locale })
      .then((result) => {
        if (reqIdRef.current !== requestId) return
        if (!result.ok && result.code === 'not-configured') {
          window.dispatchEvent(new CustomEvent('aiss-ai-need-config', { detail: { reason: 'explain' } }))
          onClose()
          return
        }
        setState({ phase: 'done', result })
      })
      .catch((e) => {
        if (reqIdRef.current === requestId) setState({ phase: 'done', result: { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) } })
      })
  }, [request, locale])

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
    setState({ phase: 'done', result: { ok: false, code: 'aborted' } })
  }

  const r = state.phase === 'done' ? state.result : null
  return (
    <section className="ai-assist-card" data-testid="ai-explain-card" aria-live="polite">
      <header className="ai-assist-head">
        <span>✨ {request.kind === 'explainAlert' ? t('a4.title') : t('a1.title')}</span>
        <button type="button" className="modal-close" aria-label={t('common.close')} onClick={onClose}>
          ×
        </button>
      </header>
      {state.phase === 'loading' ? (
        <div className="ai-assist-loading" data-testid="ai-explain-loading">
          <div className="ai-skeleton" />
          <div className="ai-skeleton ai-skeleton--short" />
          <div className="ai-assist-row">
            <span>{t('a1.analyzing')}</span>
            <button type="button" onClick={stop}>
              {t('a1.stop')}
            </button>
          </div>
        </div>
      ) : r && !r.ok ? (
        <div className="ai-assist-error" data-testid="ai-explain-error">
          <span>{r.code === 'aborted' ? t('a1.stopped') : t('a1.failed', { msg: r.message ?? '' })}</span>
          <button type="button" onClick={start}>
            {t('upd.retry')}
          </button>
        </div>
      ) : r && r.ok && (r.kind === 'explainError' || r.kind === 'explainAlert') ? (
        <div className="ai-assist-body">
          <h4>{t('a1.cause')}</h4>
          <p data-testid="ai-explain-cause">{r.cause}</p>
          {r.fixes.length ? (
            <>
              <h4>{t('a1.fix')}</h4>
              <ul className="ai-assist-fixes">
                {r.fixes.map((f, i) => (
                  <li key={i} data-testid="ai-explain-fix">
                    <code>{f.command}</code>
                    {f.note ? <div className="ai-assist-note">{f.note}</div> : null}
                    <div className="ai-assist-row">
                      <button type="button" onClick={() => onInsert(request.sessionId, f.command)}>
                        {t('a1.insert')}
                      </button>
                      <button type="button" className="primary" onClick={() => onRun(request.sessionId, f.command)}>
                        {t('a1.run')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {r.notes ? (
            <>
              <h4>{t('a1.notes')}</h4>
              <p className="ai-assist-note">{r.notes}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
