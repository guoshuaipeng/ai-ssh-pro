import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiChatMessage } from '../../../shared/ipc'

type Props = {
  activeSessionId: string | null
}

type Line = { role: 'user' | 'assistant'; content: string }

export default function AIPanel({ activeSessionId }: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [includeTerminal, setIncludeTerminal] = useState(false)
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const tailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.aiss.ai.getSettings().then((s) => {
      setBaseURL(s.baseURL)
      setModel(s.model)
      setApiKey(s.apiKey ? '••••••••' : '')
    })
  }, [])

  useEffect(() => {
    tailRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, busy])

  const persistSettings = useCallback(async () => {
    const partial: { baseURL?: string; model?: string; apiKey?: string } = {
      baseURL: baseURL.trim() || undefined,
      model: model.trim() || undefined
    }
    if (apiKey && apiKey !== '••••••••') {
      partial.apiKey = apiKey
    }
    await window.aiss.ai.setSettings(partial)
  }, [apiKey, baseURL, model])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return

    let terminalExcerpt: string | undefined
    if (includeTerminal && activeSessionId) {
      const snap = await window.aiss.ssh.getSnapshot(activeSessionId, 200)
      if (snap) terminalExcerpt = snap
    }

    const userLine: Line = { role: 'user', content: text }
    setLines((prev) => [...prev, userLine])
    setInput('')
    setBusy(true)

    const history: AiChatMessage[] = [
      ...lines.map<AiChatMessage>((l) => ({
        role: l.role,
        content: l.content
      })),
      { role: 'user', content: text }
    ]

    let assistant = ''
    const unsub = window.aiss.ai.onStream((ev) => {
      if (ev.type === 'delta') {
        assistant += ev.text
        setLines((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = { role: 'assistant', content: assistant }
          } else {
            next.push({ role: 'assistant', content: assistant })
          }
          return next
        })
      } else if (ev.type === 'error') {
        setLines((prev) => [...prev, { role: 'assistant', content: `错误：${ev.message}` }])
      }
    })

    try {
      await window.aiss.ai.chat({
        messages: history,
        targetSessionId: activeSessionId ?? undefined,
        terminalExcerpt
      })
    } finally {
      unsub()
      setBusy(false)
    }
  }, [activeSessionId, busy, includeTerminal, input, lines])

  return (
    <aside className="ai-panel">
      <div className="ai-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>AI 助手</span>
        <button type="button" onClick={() => setShowSettings((s) => !s)} style={{ fontSize: 12 }}>
          {showSettings ? '收起设置' : '模型设置'}
        </button>
      </div>

      {showSettings && (
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <div className="field">
            <label>Base URL</label>
            <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" />
          </div>
          <div className="field">
            <label>Model</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
          </div>
          <div className="field">
            <label>API Key（仅存于本机主进程配置）</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              type="password"
              autoComplete="off"
            />
          </div>
          <button type="button" className="primary" onClick={() => void persistSettings()}>
            保存设置
          </button>
        </div>
      )}

      <div className="ai-messages">
        {lines.length === 0 && (
          <div className="msg assistant" style={{ opacity: 0.85 }}>
            在下方输入问题；可勾选「附带最近终端输出」把当前标签会话的环形缓冲（最多约 200 行）一并发给模型。请先配置 API Key。
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`msg ${l.role}`}>
            {l.content}
          </div>
        ))}
        <div ref={tailRef} />
      </div>

      <div className="ai-input-row">
        <div className="ai-toolbar">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
            <input
              type="checkbox"
              checked={includeTerminal}
              onChange={(e) => setIncludeTerminal(e.target.checked)}
              disabled={!activeSessionId}
            />
            附带最近终端输出
          </label>
          {!activeSessionId && <span style={{ color: 'var(--muted)', fontSize: 12 }}>（需先连接 SSH）</span>}
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例如：解释上面报错、给出安全的排查命令…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button type="button" className="primary" disabled={busy || !input.trim()} onClick={() => void send()}>
          {busy ? '生成中…' : '发送 (Ctrl+Enter)'}
        </button>
      </div>
    </aside>
  )
}
