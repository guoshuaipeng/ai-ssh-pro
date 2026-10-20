import { useEffect, useState } from 'react'
import { tg } from '../lib/i18n'
import { SCRIPT_STATE_EVENT, askAboutFailure, holdScript, resumeScript, scriptHeld, scriptState, stopScript, type ScriptState } from '../lib/ai-script-run'

/** D16d: AI step-run progress next to the command bar (replaces one toast per step). */
export default function ScriptProgress({ sessionId }: { sessionId: string }) {
  const [st, setSt] = useState<ScriptState | null>(() => scriptState(sessionId))
  const [held, setHeld] = useState(() => scriptHeld())
  useEffect(() => {
    const on = () => {
      setSt(scriptState(sessionId))
      setHeld(scriptHeld())
    }
    window.addEventListener(SCRIPT_STATE_EVENT, on)
    return () => window.removeEventListener(SCRIPT_STATE_EVENT, on)
  }, [sessionId])
  if (!st) return null
  const label =
    st.phase === 'failed'
      ? tg('d16d.failed', { code: st.code ?? '' })
      : st.phase === 'running'
        ? tg('d16d.running')
        : st.phase === 'held'
          ? tg('d16d.held')
          : st.risky
            ? tg('d16d.readyRisky')
            : tg('d16d.ready')
  return (
    <div className={`script-progress is-${st.phase}${st.risky ? ' is-risky' : ''}`} data-testid="script-progress" role="status" title={st.command}>
      <span className="script-progress-title">{tg('d16d.title')}</span>
      <span className="script-progress-count" data-testid="script-progress-count">{st.index + 1}/{st.total}</span>
      <span className="script-progress-bar" aria-hidden="true">
        <span style={{ width: `${Math.round(((st.index + (st.phase === 'running' ? 0.5 : 0)) / st.total) * 100)}%` }} />
      </span>
      <span className="script-progress-label">{label}</span>
      {st.phase === 'failed' ? (
        <>
          <button type="button" data-testid="script-ask" onClick={askAboutFailure}>{tg('d16c.ask')}</button>
          <button type="button" data-testid="script-skip" onClick={resumeScript}>{tg('d16c.skip')}</button>
        </>
      ) : held || st.phase === 'held' ? (
        <button type="button" data-testid="script-resume" onClick={resumeScript}>{tg('d16d.resume')}</button>
      ) : (
        <button type="button" data-testid="script-hold" title={tg('d16d.holdTip')} onClick={holdScript}>{tg('d16d.hold')}</button>
      )}
      <button type="button" data-testid="script-stop" onClick={stopScript}>{tg('d16b.stop')}</button>
    </div>
  )
}
