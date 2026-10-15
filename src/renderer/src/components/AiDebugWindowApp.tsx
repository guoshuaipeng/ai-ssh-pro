import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiDebugSession } from '../lib/aiDebugStore'
import { clearAiDebugSessions, getAiDebugSessions, pushAiDebugPayload, subscribeAiDebug } from '../lib/aiDebugStore'
import { tg, useI18n } from '../lib/i18n'

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return String(ts)
  }
}

function entryLabel(session: AiDebugSession, index: number): string {
  const e = session.entries[index]
  if (!e) return ''
  if (e.kind === 'model') {
    const tail = e.parseError ? tg('dbg.0') : e.structured ? `action=${e.structured.action}` : '—'
    return tg('dbg.1', { 0: String(e.round), 1: String(tail) })
  }
  if (e.kind === 'context') {
    return tg('dbg.23', { 0: String(e.round), 1: String(e.totalChars) })
  }
  return tg('dbg.2', { 0: String(e.round), 1: String(e.label) })
}

function buildDetailJson(session: AiDebugSession, index: number): string {
  const e = session.entries[index]
  if (!e) return ''
  if (e.kind === 'model') {
    return JSON.stringify(
      {
        round: e.round,
        model: e.model,
        temperature: e.temperature,
        request_messages: e.requestMessages,
        response_raw: e.responseRaw,
        structured: e.structured,
        parse_error: e.parseError ?? null
      },
      null,
      2
    )
  }
  if (e.kind === 'context') {
    return JSON.stringify(
      {
        round: e.round,
        total_chars: e.totalChars,
        slices: e.slices
      },
      null,
      2
    )
  }
  return JSON.stringify(
    {
      round: e.round,
      label: e.label,
      detail: e.detail ?? null
    },
    null,
    2
  )
}

export default function AiDebugWindowApp(): JSX.Element {
  useI18n() // re-render when the locale loads / changes
  const [, tick] = useState(0)
  const bump = useCallback(() => tick((n) => n + 1), [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0)

  useEffect(() => {
    return window.aiss.debug.onPush((payload) => {
      pushAiDebugPayload(payload)
    })
  }, [])

  useEffect(() => {
    return subscribeAiDebug(bump)
  }, [bump])

  const sessions = getAiDebugSessions()

  useEffect(() => {
    if (sessions.length === 0) return
    if (!selectedId || !sessions.some((s) => s.id === selectedId)) {
      setSelectedId(sessions[0].id)
      setSelectedEntryIdx(0)
    }
  }, [sessions, selectedId])

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null,
    [sessions, selectedId]
  )

  useEffect(() => {
    if (!activeSession) return
    if (selectedEntryIdx >= activeSession.entries.length) {
      setSelectedEntryIdx(Math.max(0, activeSession.entries.length - 1))
    }
  }, [activeSession, selectedEntryIdx])

  const detailJson = useMemo(() => {
    if (!activeSession) return ''
    return buildDetailJson(activeSession, selectedEntryIdx)
  }, [activeSession, selectedEntryIdx])

  const copyJson = useCallback(async () => {
    if (!detailJson) return
    try {
      await navigator.clipboard.writeText(detailJson)
    } catch {
      /* ignore */
    }
  }, [detailJson])

  return (
    <div className="debug-window-root">
      <div className="modal-panel ai-debug-modal ai-debug-modal--windowed" role="application" aria-labelledby="ai-debug-title">
        <div className="modal-header ai-debug-header">
          <div className="ai-debug-header-titles">
            <h2 id="ai-debug-title" className="modal-title">
              {tg('dbg.3')}
            </h2>
            <p className="ai-debug-hint">
              {tg('dbg.4')}
            </p>
          </div>
        </div>

        <div className="modal-body ai-debug-body">
          <div className="ai-debug-columns">
            <div className="ai-debug-col ai-debug-col--left">
              <div className="ai-debug-col-title">{tg('dbg.5')}</div>
              <div className="ai-debug-col-scroll">
                {sessions.length === 0 && <div className="ai-debug-empty">{tg('dbg.6')}</div>}
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`ai-debug-list-item ${s.id === activeSession?.id ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedId(s.id)
                      setSelectedEntryIdx(0)
                    }}
                  >
                    <div className="ai-debug-q">{s.userQuestion || tg('dbg.7')}</div>
                    <div className="ai-debug-ts">{formatTime(s.startedAt)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-debug-col ai-debug-col--mid">
              <div className="ai-debug-col-title">{tg('dbg.8')}</div>
              <div className="ai-debug-col-scroll">
                {!activeSession && <div className="ai-debug-empty">{tg('dbg.9')}</div>}
                {activeSession && activeSession.entries.length === 0 && (
                  <div className="ai-debug-empty">{tg('dbg.10')}</div>
                )}
                {activeSession?.entries.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`ai-debug-list-item ${i === selectedEntryIdx ? 'active' : ''}`}
                    onClick={() => setSelectedEntryIdx(i)}
                  >
                    {entryLabel(activeSession, i)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-debug-col ai-debug-col--right">
              <div className="ai-debug-col-title">
                {activeSession && activeSession.entries[selectedEntryIdx]
                  ? tg('dbg.11', { 0: String(activeSession.entries[selectedEntryIdx].round) })
                  : 'JSON'}
              </div>
              <pre className="ai-debug-json">{detailJson || tg('dbg.12')}</pre>
            </div>
          </div>
        </div>

        <div className="modal-footer ai-debug-footer">
          <button type="button" className="ai-fill-cmd-btn" onClick={() => clearAiDebugSessions()}>
            {tg('dbg.13')}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="ai-fill-cmd-btn" onClick={copyJson}>
            {tg('dbg.14')}
          </button>
          <button type="button" className="primary" onClick={bump}>
            {tg('dbg.15')}
          </button>
        </div>
      </div>
    </div>
  )
}
