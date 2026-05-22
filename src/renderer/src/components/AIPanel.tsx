import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiAssistantReply, AiChatMessage, AiProvider } from '@shared/ipc'
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
  /** 新交互协议下：需要用户确认后才能继续的 requestId */
  requestId?: string
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
  const [includeTerminal, setIncludeTerminal] = useState(true)
  const [pendingConfirm, setPendingConfirm] = useState<{ requestId: string; action: AiAssistantReply['action'] } | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [activeProviderId, setActiveProviderId] = useState('')
  const [activeModel, setActiveModel] = useState('')
  const tailRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [inputMenu, setInputMenu] = useState<{ x: number; y: number } | null>(null)
  const inputMenuRef = useRef<HTMLDivElement>(null)

  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const modelList = activeProvider?.modelList ?? []

  useEffect(() => {
    const refresh = () => {
      void window.aiss.ai.getSettings().then((s) => {
        const p = s.providers.find((x) => x.id === s.activeProviderId) ?? s.providers[0]
        setProviders(s.providers)
        setActiveProviderId(s.activeProviderId)
        setActiveModel(s.model)
        setHasApiKey(Boolean(p?.apiKey?.trim()))
      })
    }
    refresh()
    window.addEventListener('aiss-ai-settings-saved', refresh)
    return () => window.removeEventListener('aiss-ai-settings-saved', refresh)
  }, [])

  const onProviderChange = useCallback((value: string) => {
    setActiveProviderId(value)
    void window.aiss.ai.setSettings({ activeProviderId: value }).then(() => {
      window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
    })
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

  const [snapshotBusy, setSnapshotBusy] = useState(false)

  const fetchTerminalSnapshot = useCallback(async (mode: 'recent' | 'fromCommand') => {
    if (!activeSessionId) return null
    return await window.aiss.ssh.getSnapshot(activeSessionId, {
      maxLines: 1200,
      fromCurrentCommand: mode === 'fromCommand',
      includeCommandLine: true
    })
  }, [activeSessionId])

  const submitToAi = useCallback(
    async (text: string, terminalExcerpt?: string) => {
      const userLine: UserLine = { role: 'user', content: text }
      setLines((prev) => [...prev, userLine])
      setBusy(true)
      setPendingConfirm(null)

      const history: AiChatMessage[] = [
        ...lines.map<AiChatMessage>((l) => ({
          role: l.role,
          content: l.content
        })),
        { role: 'user', content: text }
      ]

      const debugTurnId = crypto.randomUUID()

      let usedStepProtocol = false
      let assistant = ''
      const unsub = window.aiss.ai.onStream((ev) => {
      if (ev.type === 'status') {
        setLines((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && last.streaming) return next
          next.push({ role: 'assistant', content: '', streaming: true })
          return next
        })
        return
      }
      if (ev.type === 'step') {
        usedStepProtocol = true
        const s = ev.structured
        setLines((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && last.streaming && !last.structured) {
            next[next.length - 1] = { role: 'assistant', content: s.description, streaming: false, structured: s, requestId: ev.requestId }
          } else {
            next.push({ role: 'assistant', content: s.description, structured: s, requestId: ev.requestId })
          }
          return next
        })
        setPendingConfirm(ev.requestId ? { requestId: ev.requestId, action: s.action } : null)
        return
      }
      if (ev.type === 'delta') {
        if (usedStepProtocol) return
        assistant += ev.text
        setLines((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && last.streaming) return next
          next.push({ role: 'assistant', content: '', streaming: true })
          return next
        })
        return
      }
      if (ev.type === 'cancelled') {
        setPendingConfirm(null)
        setLines((prev) => {
          const next = [...prev]
          const msg = ev.message?.trim() ? ev.message.trim() : '已取消'
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            next[next.length - 1] = { role: 'assistant', content: msg }
            return next
          }
          next.push({ role: 'assistant', content: msg })
          return next
        })
        return
      }
      if (ev.type === 'error') {
        setPendingConfirm(null)
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
        terminalExcerpt,
        debugTurnId
      })
      if (!usedStepProtocol) {
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
      }
    } finally {
      unsub()
      setBusy(false)
      setPendingConfirm(null)
    }
  },
    [activeSessionId, lines]
  )

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return

    let terminalExcerpt: string | undefined
    if (includeTerminal && activeSessionId) {
      const snap = await fetchTerminalSnapshot('fromCommand')
      if (snap) terminalExcerpt = snap
    }

    setInput('')
    await submitToAi(text, terminalExcerpt)
  }, [busy, fetchTerminalSnapshot, includeTerminal, activeSessionId, input, submitToAi])

  const sendConsoleToAi = useCallback(async () => {
    if (!activeSessionId || busy || snapshotBusy) return
    setSnapshotBusy(true)
    try {
      const snap = await fetchTerminalSnapshot('recent')
      if (!snap?.trim()) {
        setLines((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: '（当前终端暂无缓冲输出。请先连接 SSH，在终端产生输出后再试。）'
          }
        ])
        return
      }
      const text =
        '【已附带当前终端输出】请分析并说明当前状态、异常或风险，并给出建议的下一步（只读排查优先）。'
      await submitToAi(text, snap.trim())
    } finally {
      setSnapshotBusy(false)
    }
  }, [activeSessionId, busy, fetchTerminalSnapshot, snapshotBusy, submitToAi])

  const runSuggestedCommand = useCallback(
    (cmd: string) => {
      if (!activeSessionId) return
      const oneLine = cmd.replace(/\r\n/g, '\n').replace(/[\r\n]+/g, ' ').trim()
      if (!oneLine) return
      dispatchInjectTerminal(activeSessionId, oneLine, true)
    },
    [activeSessionId]
  )

  const confirmStep = useCallback(async (requestId: string, ok: boolean) => {
    if (!requestId) return
    setPendingConfirm(null)
    await window.aiss.ai.confirmStep(requestId, ok)
  }, [])

  const stopGeneration = useCallback(() => {
    void window.aiss.ai.abortChat()
  }, [])

  const clearConversation = useCallback(() => {
    if (busy) return
    setLines([])
    setPendingConfirm(null)
  }, [busy])

  const undoLastRound = useCallback(() => {
    if (busy) return
    setLines((prev) => {
      const next = [...prev]
      while (next.length && next[next.length - 1].role === 'assistant') next.pop()
      if (next.length && next[next.length - 1].role === 'user') {
        const u = next.pop() as UserLine
        setInput(u.content)
      }
      return next
    })
    setPendingConfirm(null)
  }, [busy])

  useEffect(() => {
    if (!inputMenu) return
    const close = (e: MouseEvent) => {
      if (inputMenuRef.current?.contains(e.target as Node)) return
      setInputMenu(null)
    }
    window.addEventListener('mousedown', close, true)
    return () => window.removeEventListener('mousedown', close, true)
  }, [inputMenu])

  return (
    <aside className="ai-panel">
      <div className="ai-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <span>AI 助手</span>
        {providers.length > 0 && (
          <label style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>当前 Provider</span>
            <select
              value={providers.some((p) => p.id === activeProviderId) ? activeProviderId : providers[0]?.id ?? ''}
              onChange={(e) => onProviderChange(e.target.value)}
              disabled={busy || providers.length <= 1}
              style={{ width: '100%', fontSize: 12 }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className="ai-fill-cmd-btn" disabled={!busy} onClick={stopGeneration} title="中断当前模型请求或等待中的确认">
            停止生成
          </button>
          <button type="button" className="ai-fill-cmd-btn" disabled={busy} onClick={clearConversation}>
            清空对话
          </button>
          <button type="button" className="ai-fill-cmd-btn" disabled={busy || lines.length === 0} onClick={undoLastRound} title="去掉上一轮用户消息及之后助手回复，并把该条问题填回输入框">
            撤回上一轮
          </button>
        </div>
      </div>
      {!hasApiKey && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
          请先在「会话 → AI 配置」为当前 Provider 填写 API Key；也可以在配置里创建多个 Provider（ChatGPT / DeepSeek / Qwen 等）。
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
            const isConfirmable = Boolean(l.requestId && pendingConfirm?.requestId === l.requestId)
            return (
              <div key={i} className="msg assistant ai-structured">
                <div className="ai-reply-desc">{s.description}</div>
                <div className={`ai-risk-badge ${riskClass(s.riskLevel)}`}>风险：{s.riskLevel}</div>
                {s.notes && <div className="ai-reply-notes">{s.notes}</div>}
                {s.action === 'tool_call' && l.requestId ? (
                  <div className="ai-reply-cmd">
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      需要调用工具：<code>{s.toolName ?? '(unknown)'}</code>
                      {s.toolInput?.maxLines ? <span style={{ marginLeft: 8 }}>maxLines：{s.toolInput.maxLines}</span> : null}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" className="ai-fill-cmd-btn" disabled={!isConfirmable} onClick={() => confirmStep(l.requestId!, true)}>
                        同意并继续
                      </button>
                      <button type="button" className="ai-fill-cmd-btn" disabled={!isConfirmable} onClick={() => confirmStep(l.requestId!, false)}>
                        不同意
                      </button>
                    </div>
                  </div>
                ) : null}
                {s.action === 'command' && s.command?.trim() && l.requestId ? (
                  <div className="ai-reply-cmd">
                    <code className="ai-reply-cmd-code">{s.command}</code>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" className="ai-fill-cmd-btn" disabled={!isConfirmable} onClick={() => confirmStep(l.requestId!, true)}>
                        同意并执行
                      </button>
                      <button type="button" className="ai-fill-cmd-btn" disabled={!isConfirmable} onClick={() => confirmStep(l.requestId!, false)}>
                        不同意
                      </button>
                    </div>
                  </div>
                ) : null}
                {/* Legacy fallback：无 requestId 时，允许用户手动执行建议命令 */}
                {(!l.requestId || l.requestId == null) && s.command?.trim() ? (
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
                ) : null}
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
          <button
            type="button"
            className="ai-fill-cmd-btn"
            disabled={!activeSessionId || busy || snapshotBusy}
            title={
              activeSessionId
                ? '抓取当前 SSH 终端最近约 1200 行并发送给 AI 分析（不依赖上方勾选）'
                : '请先连接并选中 SSH 标签页'
            }
            onClick={() => void sendConsoleToAi()}
          >
            {snapshotBusy ? '读取终端…' : '发送控制台给 AI'}
          </button>
          {!activeSessionId && <span style={{ color: 'var(--muted)', fontSize: 12 }}>（需先连接 SSH）</span>}
        </div>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例如：解释上面报错、给出安全的排查命令…"
          title="松开鼠标后自动复制选中文本；右键可复制/粘贴"
          onMouseUp={() => {
            const ta = inputRef.current
            if (!ta) return
            const { selectionStart, selectionEnd } = ta
            if (selectionStart === selectionEnd) return
            const slice = ta.value.slice(selectionStart, selectionEnd)
            if (slice) void navigator.clipboard.writeText(slice)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setInputMenu({ x: e.clientX, y: e.clientY })
          }}
          onKeyDown={(e) => {
            // 聊天输入：默认按 Enter 发送；按 Shift+Enter 换行。
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button type="button" className="primary" disabled={busy || !input.trim()} onClick={() => void send()}>
          {busy ? '生成中…' : '发送 (Enter)'}
        </button>
      </div>
      {inputMenu ? (
        <div
          ref={inputMenuRef}
          className="session-context-menu"
          style={{ left: inputMenu.x, top: inputMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="session-context-menu-item"
            disabled={
              !inputRef.current || inputRef.current.selectionStart === inputRef.current.selectionEnd
            }
            onClick={() => {
              const ta = inputRef.current
              if (!ta || ta.selectionStart === ta.selectionEnd) {
                setInputMenu(null)
                return
              }
              void navigator.clipboard.writeText(ta.value.slice(ta.selectionStart, ta.selectionEnd))
              setInputMenu(null)
            }}
          >
            复制
          </button>
          <button
            type="button"
            className="session-context-menu-item"
            onClick={() => {
              const ta = inputRef.current
              if (!ta) {
                setInputMenu(null)
                return
              }
              const start = ta.selectionStart
              const end = ta.selectionEnd
              setInputMenu(null)
              void navigator.clipboard.readText().then((text) => {
                if (!text) return
                setInput((v) => v.slice(0, start) + text + v.slice(end))
                const caret = start + text.length
                queueMicrotask(() => {
                  const el = inputRef.current
                  if (!el) return
                  el.focus()
                  el.setSelectionRange(caret, caret)
                })
              })
            }}
          >
            粘贴
          </button>
        </div>
      ) : null}
    </aside>
  )
}
