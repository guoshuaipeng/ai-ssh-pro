import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiAssistantReply, AiChatMessage } from '@shared/ipc'
import { parseAiAssistantReply } from '@shared/ipc'
import { dispatchInjectTerminal } from '../lib/terminal-inject'

type Props = {
  activeSessionId: string | null
}

type UserLine = { role: 'user'; content: string }

type AssistantLine = {
  role: 'assistant'
  content: string
  streaming?: boolean
  structured?: AiAssistantReply
}

type Line = UserLine | AssistantLine

function riskClass(level: string): string {
  const n = level.toLowerCase()
  if (n === 'low') return 'ai-risk-low'
  if (n === 'high') return 'ai-risk-high'
  return 'ai-risk-medium'
}

export default function AIPanel({ activeSessionId }: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [includeTerminal, setIncludeTerminal] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [modelList, setModelList] = useState<string[]>([])
  const [activeModel, setActiveModel] = useState('')
  const tailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refresh = () => {
      void window.aiss.ai.getSettings().then((s) => {
        setHasApiKey(Boolean(s.apiKey?.trim()))
        const list = s.modelList?.length ? s.modelList : [s.model]
        setModelList(list)
        setActiveModel(s.model)
      })
    }
    refresh()
    window.addEventListener('aiss-ai-settings-saved', refresh)
    return () => window.removeEventListener('aiss-ai-settings-saved', refresh)
  }, [])

  const onModelChange = useCallback((value: string) => {
    setActiveModel(value)
    void window.aiss.ai.setSettings({ model: value }).then(() => {
      window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
    })
  }, [])

  useEffect(() => {
    tailRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, busy])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return

    let terminalExcerpt: string | undefined
    if (includeTerminal && activeSessionId) {
      const snap = await window.aiss.ssh.getSnapshot(activeSessionId, 200)
      if (snap) terminalExcerpt = snap
    }

    const userLine: UserLine = { role: 'user', content: text }
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
          if (last?.role === 'assistant' && last.streaming) return next
          next.push({ role: 'assistant', content: '', streaming: true })
          return next
        })
      } else if (ev.type === 'error') {
        setLines((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            next[next.length - 1] = { role: 'assistant', content: `错误：${ev.message}` }
          } else {
            next.push({ role: 'assistant', content: `错误：${ev.message}` })
          }
          return next
        })
      }
    })

    try {
      await window.aiss.ai.chat({
        messages: history,
        targetSessionId: activeSessionId ?? undefined,
        terminalExcerpt
      })
      const raw = assistant.trim()
      const parsed = parseAiAssistantReply(raw)
      setLines((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          if (parsed) {
            next[next.length - 1] = { role: 'assistant', content: raw, structured: parsed }
          } else {
            next[next.length - 1] = {
              role: 'assistant',
              content: raw || '（模型未返回可解析的 JSON）'
            }
          }
        } else if (last?.role === 'user') {
          if (raw) {
            if (parsed) next.push({ role: 'assistant', content: raw, structured: parsed })
            else next.push({ role: 'assistant', content: raw })
          } else {
            next.push({ role: 'assistant', content: '（无回复）' })
          }
        }
        return next
      })
    } finally {
      unsub()
      setBusy(false)
    }
  }, [activeSessionId, busy, includeTerminal, input, lines])

  const runSuggestedCommand = useCallback(
    (cmd: string) => {
      if (!activeSessionId) return
      const oneLine = cmd.replace(/\r\n/g, '\n').replace(/[\r\n]+/g, ' ').trim()
      if (!oneLine) return
      dispatchInjectTerminal(activeSessionId, oneLine, true)
    },
    [activeSessionId]
  )

  return (
    <aside className="ai-panel">
      <div className="ai-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <span>AI 助手</span>
        {modelList.length > 0 && (
          <label style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>当前模型</span>
            <select
              value={modelList.includes(activeModel) ? activeModel : modelList[0] ?? ''}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={busy}
              style={{ width: '100%', fontSize: 12 }}
            >
              {modelList.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!hasApiKey && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          请先在「会话 → AI 配置」填写 API Key；可在配置里编辑多模型列表。
        </div>
      )}

      <div className="ai-messages">
        {lines.length === 0 && (
          <div className="msg assistant" style={{ opacity: 0.85 }}>
            助手会以 JSON 返回说明（description）、可选命令（command）、风险等级（riskLevel）等；生成过程中先显示「正在生成…」。若有命令，可点「执行」写入当前 SSH 标签页并回车执行。
          </div>
        )}
        {lines.map((l, i) => {
          if (l.role === 'user') {
            return (
              <div key={i} className="msg user">
                {l.content}
              </div>
            )
          }
          if (l.streaming) {
            return (
              <div key={i} className="msg assistant">
                正在生成…
              </div>
            )
          }
          if (l.structured) {
            const s = l.structured
            return (
              <div key={i} className="msg assistant ai-structured">
                <div className="ai-reply-desc">{s.description}</div>
                <div className={`ai-risk-badge ${riskClass(s.riskLevel)}`}>风险：{s.riskLevel}</div>
                {s.notes && <div className="ai-reply-notes">{s.notes}</div>}
                {s.command?.trim() && (
                  <div className="ai-reply-cmd">
                    <code className="ai-reply-cmd-code">{s.command}</code>
                    <button
                      type="button"
                      className="ai-fill-cmd-btn"
                      disabled={!activeSessionId}
                      title={activeSessionId ? '写入当前 SSH 终端当前行并回车执行' : '请先连接并选中 SSH 标签页'}
                      onClick={() => runSuggestedCommand(s.command!)}
                    >
                      执行
                    </button>
                  </div>
                )}
              </div>
            )
          }
          return (
            <div key={i} className="msg assistant">
              {l.content}
            </div>
          )
        })}
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
