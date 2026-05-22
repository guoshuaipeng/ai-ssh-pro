import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiDebugSession } from '../lib/aiDebugStore'
import { clearAiDebugSessions, getAiDebugSessions, pushAiDebugPayload, subscribeAiDebug } from '../lib/aiDebugStore'

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
    const tail = e.parseError ? `解析失败` : e.structured ? `action=${e.structured.action}` : '—'
    return `第 ${e.round} 轮 · 模型 · ${tail}`
  }
  return `第 ${e.round} 步 · ${e.label}`
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
              AI 助手调试（提示词与对话）
            </h2>
            <p className="ai-debug-hint">
              独立窗口可拖动、缩放；在主窗口向 AI 助手发送消息后，调试数据会推送到此处。左侧为每次提问，中间为模型轮次与执行步骤，右侧为
              request_messages、response_raw、structured 等 JSON。
            </p>
          </div>
        </div>

        <div className="modal-body ai-debug-body">
          <div className="ai-debug-columns">
            <div className="ai-debug-col ai-debug-col--left">
              <div className="ai-debug-col-title">用户问题</div>
              <div className="ai-debug-col-scroll">
                {sessions.length === 0 && <div className="ai-debug-empty">暂无记录；请保持本窗口打开并在主窗口向 AI 发消息。</div>}
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
                    <div className="ai-debug-q">{s.userQuestion || '(空)'}</div>
                    <div className="ai-debug-ts">{formatTime(s.startedAt)}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-debug-col ai-debug-col--mid">
              <div className="ai-debug-col-title">明细条目</div>
              <div className="ai-debug-col-scroll">
                {!activeSession && <div className="ai-debug-empty">请选择左侧一次提问。</div>}
                {activeSession && activeSession.entries.length === 0 && (
                  <div className="ai-debug-empty">该次提问尚无调试数据。</div>
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
                  ? `第 ${activeSession.entries[selectedEntryIdx].round} 轮 · JSON`
                  : 'JSON'}
              </div>
              <pre className="ai-debug-json">{detailJson || '（无内容）'}</pre>
            </div>
          </div>
        </div>

        <div className="modal-footer ai-debug-footer">
          <button type="button" className="ai-fill-cmd-btn" onClick={() => clearAiDebugSessions()}>
            清空记录
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="ai-fill-cmd-btn" onClick={copyJson}>
            复制 JSON
          </button>
          <button type="button" className="primary" onClick={bump}>
            刷新内容
          </button>
        </div>
      </div>
    </div>
  )
}
