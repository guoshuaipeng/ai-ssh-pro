import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiAssistResult } from '@shared/ipc'
import { useI18n } from '../lib/i18n'
import { rememberAiFixes } from '../lib/ai-fix-memory'
import AiConfigCard from './AiConfigCard'
import Icon from './Icon'
import Button from './ui/Button'

export type AiExplainRequest = { id: number; sessionId: string; text: string; host?: string; kind?: 'explainError' | 'explainAlert'; alertId?: string }

type Props = {
  request: AiExplainRequest
  onClose: () => void
  onOpenSettings: () => void
  onInsert: (sessionId: string, command: string) => void
  onRun: (sessionId: string, command: string) => void
  /** W1: build a reviewable draft. Never runs the commands. */
  onCreatePlaybook?: (fixes: Array<{ command: string; note?: string }>) => void
  /** Keep the UX-37 card inside this surface instead of jumping to the AI panel. */
  embed?: boolean
  /** W1 row menu: pulse the create button after explain. Does not draft. */
  highlightCreate?: boolean
}

/** A1: "Explain with AI" result in the right-hand AI panel — cause, fix commands (Insert / Run), notes. */
export default function AiAssistCard({ request, onClose, onOpenSettings, onInsert, onRun, onCreatePlaybook, embed, highlightCreate }: Props) {
  const { t, locale } = useI18n()
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'done'; result: AiAssistResult }>({ phase: 'loading' })
  const [pulseCreate, setPulseCreate] = useState(false)
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
          if (!embed) {
            window.dispatchEvent(new CustomEvent('aiss-ai-need-config', { detail: { reason: request.kind === 'explainAlert' ? 'alert' : 'explain' } }))
            onClose()
            return
          }
          setState({ phase: 'done', result })
          return
        }
        if (result.ok && (result.kind === 'explainError' || result.kind === 'explainAlert')) {
          const key = request.alertId ? `explainAlert:${request.alertId}` : `${request.kind ?? 'explainError'}:${request.sessionId}`
          rememberAiFixes(key, result.fixes)
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

  useEffect(() => {
    if (!highlightCreate || state.phase !== 'done') {
      setPulseCreate(false)
      return
    }
    const result = state.result
    if (!result.ok || (result.kind !== 'explainError' && result.kind !== 'explainAlert')) {
      setPulseCreate(false)
      return
    }
    setPulseCreate(true)
    const timer = window.setTimeout(() => setPulseCreate(false), 2000)
    return () => window.clearTimeout(timer)
  }, [highlightCreate, state])

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
        <span><Icon name="sparkles" size={14} /> {request.kind === 'explainAlert' ? t('a4.title') : t('a1.title')}</span>
        <button type="button" className="modal-close" aria-label={t('common.close')} onClick={onClose}>
          ×
        </button>
      </header>
      {state.phase === 'loading' ? (
        <div className="ai-assist-loading" data-testid="ai-explain-loading">
          <div className="ai-skeleton" />
          <div className="ai-skeleton ai-skeleton--short" />
          <div className="ai-assist-row">
            <span>{request.kind === 'explainAlert' ? t('a4.gathering') : t('a1.analyzing')}</span>
            <button type="button" onClick={stop}>
              {t('a1.stop')}
            </button>
          </div>
        </div>
      ) : r && !r.ok && r.code === 'not-configured' ? (
        <AiConfigCard context={t('ux37.needAlert')} onConfigure={onOpenSettings} />
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
                      <Button variant="primary" onClick={() => onRun(request.sessionId, f.command)}>
                        {t('a1.run')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="w1-create-row">
            <button
              type="button"
              className={`w1-create${pulseCreate ? ' is-highlight' : ''}`}
              data-testid="w1-create"
              data-highlight={pulseCreate ? '1' : undefined}
              disabled={!r.fixes.length}
              title={r.fixes.length ? t('w1.createHint', { n: r.fixes.length }) : t('w1.noFix')}
              onClick={() => r.fixes.length && onCreatePlaybook?.(r.fixes)}
            >
              {t('w1.create')}
            </button>
            {r.fixes.length ? <span className="w1-create-hint">{t('w1.createHint', { n: r.fixes.length })}</span> : (
              <button type="button" className="linkish" data-testid="w1-blank" onClick={() => onCreatePlaybook?.([])}>{t('w1.blank')}</button>
            )}
            {pulseCreate ? <span className="sr-only" data-testid="w1-after-interpret">{t('w1.afterInterpret')}</span> : null}
          </div>
          {r.notes ? (
            <>
              <h4>{t('a1.notes')}</h4>
              <p className="ai-assist-note">{r.notes}</p>
            </>
          ) : null}
          {r.kind === 'explainAlert' ? (
            <p className="a4-privacy" data-testid="a4-privacy">
              {t('a4.privacy')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
