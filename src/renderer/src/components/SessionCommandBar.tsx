import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LATENCY_POLL_MS, classifyLatency } from '@shared/workspace-features'
import type { AiAssistResult } from '@shared/ipc'
import { useI18n } from '../lib/i18n'
import { notifyHistoryChanged } from '../lib/workspace-events'
import CommandInput from './CommandInput'
import { assessCommandRisk } from '../../../shared/command-risk'
import { explainCommand } from '../../../shared/command-explain'
import { askConfirm } from '../lib/dialogs'
import { COMMAND_BAR_AI_MODE_EVENT, COMMAND_BAR_FILL_EVENT, noteSubmitted } from '../lib/ai-events'
import { confirmAndRunAiCommand } from '../lib/ai-run'

type Props = {
  sessionId: string
  /** shown in "Run on {host}?" (A2) */
  hostLabel?: string
  onOpenAiSettings?: () => void
}

type AiCard = { prompt: string } & ({ phase: 'loading' } | { phase: 'done'; result: AiAssistResult })

const CMD_BAR_OPEN_KEY = 'aiss.cmdBarOpen'

function readCmdBarOpen(): boolean {
  try {
    return localStorage.getItem(CMD_BAR_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeCmdBarOpen(open: boolean): void {
  try {
    localStorage.setItem(CMD_BAR_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** Sends one line to the active terminal via the existing ssh.write path; "#" or Ctrl+Shift+Space switches to AI mode (A2). */
export default function SessionCommandBar({ sessionId, hostLabel, onOpenAiSettings }: Props) {
  const { t, locale } = useI18n()
  const [draft, setDraft] = useState('')
  const [aiMode, setAiMode] = useState(false)
  const [open, setOpen] = useState(readCmdBarOpen)
  const [moreOpen, setMoreOpen] = useState(false)
  const openRef = useRef(open)
  openRef.current = open
  const setOpenPersist = (next: boolean) => {
    openRef.current = next
    setOpen(next)
    writeCmdBarOpen(next)
  }
  const [aiCard, setAiCard] = useState<AiCard | null>(null)
  const aiReqRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const inAi = aiMode || draft.startsWith('#')
  const explain = useMemo(() => {
    if (inAi) return null
    const e = explainCommand(draft, locale)
    return e && (e.risk || e.segments.some((x) => x.known)) ? e : null
  }, [draft, locale, inAi])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setLatency(undefined)
    const tick = async () => {
      let ms: number | null = null
      try {
        ms = await window.aiss.workspace.ping(sessionId)
      } catch {
        ms = null
      }
      if (!alive) return
      setLatency(ms)
      timer = setTimeout(() => void tick(), LATENCY_POLL_MS)
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [sessionId])

  // A1 "Insert" / A2 "Tab": another component puts a command into this bar (never runs it)
  useEffect(() => {
    const onFill = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string; command: string }>).detail
      if (!d || d.sessionId !== sessionId) return
      setOpenPersist(true)
      setAiMode(false)
      setDraft(d.command)
      if (d.command) window.setTimeout(() => inputRef.current?.focus(), 0)
    }
    const onAi = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string | null }>).detail
      if (d?.sessionId && d.sessionId !== sessionId) return
      if (!openRef.current) {
        setOpenPersist(true)
        setAiMode(true)
        window.setTimeout(() => inputRef.current?.focus(), 40)
        return
      }
      const focused = document.activeElement === inputRef.current
      setAiMode((v) => (focused ? !v : true))
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
    window.addEventListener(COMMAND_BAR_FILL_EVENT, onFill)
    window.addEventListener(COMMAND_BAR_AI_MODE_EVENT, onAi)
    return () => {
      window.removeEventListener(COMMAND_BAR_FILL_EVENT, onFill)
      window.removeEventListener(COMMAND_BAR_AI_MODE_EVENT, onAi)
    }
  }, [sessionId])

  useEffect(
    () => () => {
      if (aiReqRef.current) void window.aiss.ai.abortAssist(aiReqRef.current)
    },
    []
  )

  const generate = useCallback(
    (prompt: string) => {
      const text = prompt.replace(/^#\s*/, '').trim()
      if (!text) return
      const requestId = `a2-${Date.now()}`
      aiReqRef.current = requestId
      setAiCard({ prompt: text, phase: 'loading' })
      void window.aiss.ai
        .assist({ requestId, kind: 'nlCommand', text, host: hostLabel, locale })
        .then((result) => {
          if (aiReqRef.current === requestId) setAiCard({ prompt: text, phase: 'done', result })
        })
        .catch((e) => {
          if (aiReqRef.current === requestId) {
            setAiCard({ prompt: text, phase: 'done', result: { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) } })
          }
        })
    },
    [hostLabel, locale]
  )

  const aiResult = aiCard?.phase === 'done' && aiCard.result.ok && aiCard.result.kind === 'nlCommand' ? aiCard.result : null
  const closeCard = () => {
    if (aiReqRef.current) void window.aiss.ai.abortAssist(aiReqRef.current)
    aiReqRef.current = ''
    setAiCard(null)
  }
  const acceptIntoInput = () => {
    if (!aiResult) return
    setAiMode(false)
    setDraft(aiResult.command)
    setAiCard(null)
  }
  const runAiResult = async () => {
    if (!aiResult) return
    const r = aiResult
    setAiCard(null)
    setAiMode(false)
    await confirmAndRunAiCommand({ sessionId, command: r.command, host: hostLabel, aiRisk: r.risk })
  }

  const onSubmit = async (command: string) => {
    if (inAi) {
      setAiMode(true)
      generate(command)
      return
    }
    const risk = assessCommandRisk(command)
    if (risk) {
      const ok = await askConfirm(t('risk.title'), `${t('risk.hint', { reason: t(risk.reasonKey) })}\n\n${command}`, { danger: true, okLabel: t('risk.run') })
      if (!ok) {
        setError(t('risk.blocked'))
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      await window.aiss.workspace.commandHistory.push(command)
      notifyHistoryChanged()
      noteSubmitted(sessionId, command)
      const ok = await window.aiss.ssh.write(sessionId, `${command}\r`)
      if (!ok) setError(t('history.sendFailed'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const clearHistory = async () => {
    await window.aiss.workspace.commandHistory.clear()
    notifyHistoryChanged()
  }

  const riskLabel = (r: 'safe' | 'caution' | 'danger') => t(r === 'danger' ? 'a2.danger' : r === 'caution' ? 'a2.caution' : 'a2.safe')
  const effectiveRisk = aiResult ? (assessCommandRisk(aiResult.command) ? 'danger' : aiResult.risk) : 'safe'

  if (!open) {
    return (
      <button
        type="button"
        className="cmd-bar-fab"
        data-testid="cmd-bar-fab"
        title={t('cmd.expand')}
        aria-label={t('cmd.expand')}
        onClick={() => {
          setOpenPersist(true)
          window.setTimeout(() => inputRef.current?.focus(), 40)
        }}
      >
        ✨
      </button>
    )
  }

  return (
    <div className={`session-command-bar${inAi ? ' is-ai' : ''}`}>
      <CommandInput
        submitOnEnter
        disabled={busy}
        value={draft}
        onValueChange={setDraft}
        inputRef={inputRef}
        suggest={!inAi}
        className={inAi ? 'command-input--ai' : undefined}
        placeholder={inAi ? t('a2.placeholder') : undefined}
        ariaLabel={inAi ? t('a2.placeholder') : undefined}
        prefix={
          inAi ? (
            <span className="ai-mode-mark" data-testid="ai-mode-mark" title={t('a2.modeTitle')}>
              ✨
            </span>
          ) : null
        }
        interceptKey={(e) => {
          if (e.key === ' ' && e.ctrlKey && e.shiftKey) {
            setAiMode((v) => !v)
            return true
          }
          if (aiCard) {
            if (e.key === 'Escape') {
              closeCard()
              return true
            }
            if (e.key === 'Tab' && aiResult) {
              acceptIntoInput()
              return true
            }
            if (e.key === 'Enter' && aiResult && (!draft.trim() || draft.trim() === `#${aiCard.prompt}` || draft.trim() === aiCard.prompt)) {
              void runAiResult()
              return true
            }
          } else if (e.key === 'Escape' && aiMode) {
            setAiMode(false)
            return true
          }
          return false
        }}
        onSubmit={(command) => void onSubmit(command)}
      />
      <div className="cmd-bar-more-wrap">
        <button
          type="button"
          className="st-icon-btn"
          aria-label={t('st.more')}
          title={t('st.more')}
          onClick={() => setMoreOpen((v) => !v)}
        >
          ⋯
        </button>
        {moreOpen ? (
          <div className="cmd-bar-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false)
                void clearHistory()
              }}
            >
              {t('history.clear')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false)
                setOpenPersist(false)
                setAiMode(false)
              }}
            >
              {t('cmd.collapse')}
            </button>
          </div>
        ) : null}
      </div>
      {latency !== undefined ? (
        <span className={`session-latency session-latency-${classifyLatency(latency)}`} title={t('latency.title')}>
          ● {latency === null ? t('latency.down') : `${latency} ms`}
        </span>
      ) : null}
      {error ? <span className="session-command-error">{error}</span> : null}
      {aiCard ? (
        <div className="ai-cmd-card" data-testid="ai-cmd-card" role="dialog" aria-label={t('a2.modeTitle')}>
          {aiCard.phase === 'loading' ? (
            <div className="ai-cmd-row">
              <span className="ai-spinner" aria-hidden /> {t('a2.generating')}
            </div>
          ) : !aiCard.result.ok && aiCard.result.code === 'not-configured' ? (
            <div className="ai-cmd-row">
              <span>{t('a1.needAi')}</span>
              <button type="button" className="primary" onClick={() => onOpenAiSettings?.()}>
                {t('a2.goConfig')}
              </button>
            </div>
          ) : !aiCard.result.ok ? (
            <div className="ai-cmd-row" data-testid="ai-cmd-error">
              <span>{aiCard.result.code === 'aborted' ? t('a1.stopped') : t('a1.failed', { msg: aiCard.result.message ?? '' })}</span>
              <button type="button" onClick={() => generate(aiCard.prompt)}>
                {t('upd.retry')}
              </button>
            </div>
          ) : aiResult ? (
            <>
              <div className="ai-cmd-row">
                <code className="ai-cmd-command" data-testid="ai-cmd-command">
                  {aiResult.command}
                </code>
                <span className={`ai-risk ai-risk--${effectiveRisk}`} data-testid="ai-cmd-risk">
                  {riskLabel(effectiveRisk)}
                </span>
              </div>
              {aiResult.explanation ? <div className="ai-cmd-expl">{aiResult.explanation}</div> : null}
              <div className="ai-cmd-row ai-cmd-actions">
                <button type="button" onClick={acceptIntoInput}>
                  {t('a2.fill')} <kbd>Tab</kbd>
                </button>
                <button type="button" className={effectiveRisk === 'danger' ? 'primary danger' : 'primary'} onClick={() => void runAiResult()}>
                  {t('a1.run')} <kbd>Enter</kbd>
                </button>
                <button type="button" onClick={closeCard}>
                  {t('dlg.cancel')} <kbd>Esc</kbd>
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {explain ? (
        <div className={`cmd-explain${explain.risk ? ' is-risky' : ''}`} data-testid="cmd-explain" aria-live="polite">
          {explain.segments.map((seg, i) => (
            <span key={i} className="cmd-explain-seg">
              {i > 0 ? <span className="cmd-explain-pipe">│</span> : null}
              <code>{seg.program}</code> {seg.known ? seg.text : t('explain.unknown')}
              {seg.prefixes.map((p) => (
                <em key={p}> · {p}</em>
              ))}
              {seg.flags.map((f) => (
                <span key={f.flag}>
                  {' '}
                  · <code>{f.flag}</code> {f.text}
                </span>
              ))}
            </span>
          ))}
          {explain.risk ? <span className="cmd-explain-risk">⚠ {t(explain.risk)}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
