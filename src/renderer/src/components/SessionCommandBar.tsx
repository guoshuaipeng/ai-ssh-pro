import { useEffect, useMemo, useState } from 'react'
import { LATENCY_POLL_MS, classifyLatency } from '@shared/workspace-features'
import { useI18n } from '../lib/i18n'
import { notifyHistoryChanged } from '../lib/workspace-events'
import CommandInput from './CommandInput'
import { assessCommandRisk } from '../../../shared/command-risk'
import { explainCommand } from '../../../shared/command-explain'
import { askConfirm } from '../lib/dialogs'

type Props = {
  sessionId: string
}

/** Sends one line to the active terminal via the existing ssh.write path. */
export default function SessionCommandBar({ sessionId }: Props) {
  const { t, locale } = useI18n()
  const [draft, setDraft] = useState('')
  const explain = useMemo(() => {
    const e = explainCommand(draft, locale)
    return e && (e.risk || e.segments.some((x) => x.known)) ? e : null
  }, [draft, locale])
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

  const onSubmit = async (command: string) => {
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

  return (
    <div className="session-command-bar">
      <CommandInput submitOnEnter disabled={busy} value={draft} onValueChange={setDraft} onSubmit={(command) => void onSubmit(command)} />
      <button type="button" className="session-command-clear" onClick={() => void clearHistory()}>
        {t('history.clear')}
      </button>
      {latency !== undefined ? (
        <span className={`session-latency session-latency-${classifyLatency(latency)}`} title={t('latency.title')}>
          ● {latency === null ? t('latency.down') : `${latency} ms`}
        </span>
      ) : null}
      {error ? <span className="session-command-error">{error}</span> : null}
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
