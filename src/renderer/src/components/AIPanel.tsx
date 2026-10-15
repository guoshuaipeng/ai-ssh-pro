import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { tg } from '../lib/i18n'
import { friendlyErrorMessage } from '../lib/friendly-error'
import type { AiAssistantReply, AiChatMessage, AiProvider } from '@shared/ipc'
import { parseAiAssistantReply } from '@shared/ipc'
import { highlightKeyNumbers } from '@shared/ai-reply-cards'
import { dispatchInjectTerminal } from '../lib/terminal-inject'
import { showToast } from '../lib/toast'
import { confirmDialog } from '../lib/dialogs'
import { visibleWorkingGoal } from '@shared/working-memory-view'
import AiConfigCard from './AiConfigCard'

type Props = {
  activeSessionId: string | null
  /** Stable key for persisted chat history (e.g. saved profile id); falls back to session id */
  historyKey?: string | null
  hostInventoryId?: string | null
  inventoryLookup?: { host?: string; port?: number; profileId?: string } | null
  onOpenSettings?: () => void
}

type UserLine = { role: 'user'; content: string }

type AssistantLine = {
  role: 'assistant'
  content: string
  streaming?: boolean
  structured?: AiAssistantReply
  /** 新交互协议下：需要用户确认后才能继续的 requestId */
  requestId?: string
  /** 本卡确认结果。命令不会因 low 风险自动执行。 */
  decision?: 'agreed' | 'skipped'
  /** 非结构化回复：仍用卡片壳，并提示未能识别步骤 */
  parseMiss?: boolean
  variant?: 'error'
  detail?: string
}

type Line = UserLine | AssistantLine

function riskClass(level: string): string {
  const n = level.toLowerCase()
  if (n === 'low') return 'ai-risk-low'
  if (n === 'high') return 'ai-risk-high'
  return 'ai-risk-medium'
}

function HighlightedText({ text }: { text: string }): ReactNode {
  const parts = highlightKeyNumbers(text)
  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'mark' ? (
          <mark key={i} className="ai-hl-num">
            {p.text}
          </mark>
        ) : p.kind === 'strong' ? (
          <strong key={i}>{p.text}</strong>
        ) : (
          p.text
        )
      )}
    </>
  )
}

function RiskBadge({ level }: { level: string }) {
  const n = (level || 'medium').toLowerCase()
  return <div className={`ai-risk-badge ${riskClass(n)}`}>{tg('ux64.risk', { level: n })}</div>
}

function resolveHistoryKey(historyKey: string | null | undefined, activeSessionId: string | null): string | null {
  const k = historyKey?.trim() || activeSessionId?.trim() || ''
  return k || null
}

function linesToHistoryMessages(lines: Line[]): AiChatMessage[] {
  return lines
    .filter((l) => !('streaming' in l && l.streaming))
    .map((l) => ({ role: l.role, content: l.content }))
}

function historyToLines(messages: AiChatMessage[]): Line[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) =>
      m.role === 'user'
        ? ({ role: 'user', content: m.content } satisfies UserLine)
        : ({ role: 'assistant', content: m.content } satisfies AssistantLine)
    )
}

export default function AIPanel({
  activeSessionId,
  historyKey = null,
  hostInventoryId = null,
  inventoryLookup = null,
  onOpenSettings
}: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [includeTerminal, setIncludeTerminal] = useState(true)
  const [pendingConfirm, setPendingConfirm] = useState<{ requestId: string; action: AiAssistantReply['action'] } | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [configContext, setConfigContext] = useState<string | null>(null)
  const [configFlash, setConfigFlash] = useState(false)
  const hadKey = useRef(false)
  const sawSettings = useRef(false)
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [activeProviderId, setActiveProviderId] = useState('')
  const [activeModel, setActiveModel] = useState('')
  const tailRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [inputMenu, setInputMenu] = useState<{ x: number; y: number } | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [workingGoal, setWorkingGoal] = useState<string | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const inputMenuRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines
  const persistKey = resolveHistoryKey(historyKey, activeSessionId)
  const persistKeyRef = useRef(persistKey)
  persistKeyRef.current = persistKey

  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const modelList = activeProvider?.modelList ?? []

  useEffect(() => {
    const refresh = () => {
      void window.aiss.ai.getSettings().then((s) => {
        const p = s.providers.find((x) => x.id === s.activeProviderId) ?? s.providers[0]
        setProviders(s.providers)
        setActiveProviderId(s.activeProviderId)
        setActiveModel(s.model)
        const ready = Boolean(p?.apiKey?.trim())
        setHasApiKey(ready)
        if (sawSettings.current && !hadKey.current && ready) showToast(tg('ux37.ready'))
        hadKey.current = ready
        sawSettings.current = true
      })
    }
    refresh()
    window.addEventListener('aiss-ai-settings-saved', refresh)
    return () => window.removeEventListener('aiss-ai-settings-saved', refresh)
  }, [])

  useEffect(() => {
    const onNeed = (e: Event) => {
      const reason = (e as CustomEvent<{ reason?: string }>).detail?.reason
      const text =
        reason === 'explain'
          ? tg('ux37.needExplain')
          : reason === 'selection'
            ? tg('ux37.needSelection')
            : reason === 'command'
              ? tg('ux37.needCommand')
              : reason === 'alert'
                ? tg('ux37.needAlert')
                : null
      setConfigContext(text)
      setConfigFlash(true)
      window.setTimeout(() => setConfigFlash(false), 1200)
    }
    window.addEventListener('aiss-ai-need-config', onNeed)
    return () => window.removeEventListener('aiss-ai-need-config', onNeed)
  }, [])

  const refreshWorkingGoal = useCallback((key: string | null) => {
    if (!key) {
      setWorkingGoal(null)
      return
    }
    void window.aiss.ai.getWorkingMemory(key).then((goal) => {
      if (persistKeyRef.current !== key) return
      setWorkingGoal(visibleWorkingGoal(goal))
    })
  }, [])

  // Load persisted chat when history key / session changes
  useEffect(() => {
    let cancelled = false
    setPendingConfirm(null)
    if (!persistKey) {
      setLines([])
      return
    }
    setLines([])
    void window.aiss.ai.getChatHistory(persistKey).then((msgs) => {
      if (cancelled) return
      setLines(historyToLines(msgs))
    })
    return () => {
      cancelled = true
    }
  }, [persistKey])

  useEffect(() => {
    refreshWorkingGoal(persistKey)
  }, [persistKey, refreshWorkingGoal])

  const persistHistory = useCallback(
    (nextLines: Line[]) => {
      if (!persistKey) return
      void window.aiss.ai.setChatHistory(persistKey, linesToHistoryMessages(nextLines))
    },
    [persistKey]
  )

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
          const row: AssistantLine = {
            role: 'assistant',
            content: s.description,
            streaming: false,
            structured: s,
            requestId: ev.requestId
          }
          if (last?.role === 'assistant' && last.streaming && !last.structured) {
            next[next.length - 1] = row
          } else {
            next.push(row)
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
          const msg = ev.message?.trim() ? ev.message.trim() : tg('ai.cancelled')
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
          const raw = String(ev.message ?? '')
          const row: AssistantLine = {
            role: 'assistant',
            content: tg('pf5.aiFail'),
            detail: friendlyErrorMessage(raw),
            variant: 'error'
          }
          if (last?.role === 'assistant' && last.streaming) {
            next[next.length - 1] = row
          } else {
            next.push(row)
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
        debugTurnId,
        historyKey: persistKey ?? undefined,
        hostInventoryId: hostInventoryId?.trim() || undefined,
        inventoryLookup: inventoryLookup
          ? {
              host: inventoryLookup.host,
              port: inventoryLookup.port,
              profileId: inventoryLookup.profileId
            }
          : undefined
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
                content: raw || tg('ai.badJson'),
                parseMiss: true
              }
            }
          } else if (last?.role === 'user') {
            if (raw) {
              if (parsed) next.push({ role: 'assistant', content: raw, structured: parsed })
              else next.push({ role: 'assistant', content: raw, parseMiss: true })
            } else {
              next.push({ role: 'assistant', content: tg('ai.noReply'), parseMiss: true })
            }
          }
          return next
        })
      }
    } finally {
      unsub()
      setBusy(false)
      setPendingConfirm(null)
      refreshWorkingGoal(persistKey)
      // Persist user + assistant text after the turn completes
      queueMicrotask(() => {
        persistHistory(linesRef.current)
      })
    }
  },
    [activeSessionId, hostInventoryId, inventoryLookup, lines, persistHistory, persistKey, refreshWorkingGoal]
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
            content: tg('ai.noBuffer')
          }
        ])
        return
      }
      const text =
        tg('ai.analyzePrompt')
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
    setLines((prev) =>
      prev.map((row) =>
        row.role === 'assistant' && row.requestId === requestId
          ? { ...row, decision: ok ? 'agreed' : 'skipped' }
          : row
      )
    )
    await window.aiss.ai.confirmStep(requestId, ok)
  }, [])

  const markDecision = useCallback((index: number, decision: 'agreed' | 'skipped') => {
    setLines((prev) =>
      prev.map((row, idx) => (idx === index && row.role === 'assistant' ? { ...row, decision } : row))
    )
  }, [])

  const retryLastUser = useCallback(() => {
    if (busy) return
    const prev = linesRef.current
    for (let i = prev.length - 1; i >= 0; i--) {
      const row = prev[i]
      if (row?.role === 'user' && row.content.trim()) {
        void submitToAi(row.content)
        return
      }
    }
  }, [busy, submitToAi])

  const stopGeneration = useCallback(() => {
    void window.aiss.ai.abortChat()
  }, [])

  const clearConversation = useCallback(() => {
    if (busy) return
    void (async () => {
      const ok = await confirmDialog({
        title: tg('wm.clearTitle'),
        body: tg('wm.clearBody'),
        confirmText: tg('ai.clear'),
        danger: true
      })
      if (!ok) return
      setLines([])
      setPendingConfirm(null)
      setWorkingGoal(null)
      if (persistKey) {
        await window.aiss.ai.setChatHistory(persistKey, [])
        refreshWorkingGoal(persistKey)
      }
    })()
  }, [busy, persistKey, refreshWorkingGoal])

  const undoLastRound = useCallback(() => {
    if (busy) return
    setLines((prev) => {
      const next = [...prev]
      while (next.length && next[next.length - 1].role === 'assistant') next.pop()
      if (next.length && next[next.length - 1].role === 'user') {
        const u = next.pop() as UserLine
        setInput(u.content)
      }
      persistHistory(next)
      return next
    })
    setPendingConfirm(null)
  }, [busy, persistHistory])

  useEffect(() => {
    if (!inputMenu) return
    const close = (e: MouseEvent) => {
      if (inputMenuRef.current?.contains(e.target as Node)) return
      setInputMenu(null)
    }
    window.addEventListener('mousedown', close, true)
    return () => window.removeEventListener('mousedown', close, true)
  }, [inputMenu])

  useEffect(() => {
    if (!moreOpen) return
    const close = (e: MouseEvent) => {
      if (moreRef.current?.contains(e.target as Node)) return
      setMoreOpen(false)
    }
    window.addEventListener('mousedown', close, true)
    return () => window.removeEventListener('mousedown', close, true)
  }, [moreOpen])

  return (
    <aside className="ai-panel" style={{ minWidth: 280 }}>
      {!hasApiKey ? (
        <div className="ai-empty-state" data-testid="ai-empty-state">
          <div className="ai-config-head">{tg('ai.title')}</div>
          <AiConfigCard context={configContext} flash={configFlash} onConfigure={() => onOpenSettings?.()} />
        </div>
      ) : (
        <>
      <div className="ai-header">
        <div className="ai-header-row">
        <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>{tg('ai.title')}</span>
        {modelList.length > 0 ? (
          <select
            data-testid="ai-provider-select"
            value={modelList.includes(activeModel) ? activeModel : modelList[0] ?? ''}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={busy}
            title={tg('ai.model')}
            style={{ flex: 1, minWidth: 0, fontSize: 12 }}
          >
            {modelList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : null}
        {busy ? (
          <button type="button" className="ai-fill-cmd-btn" onClick={stopGeneration} title={tg('ai.stopTip')} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
            {tg('ai.stop')}
          </button>
        ) : null}
        <div className="titlebar-popover-wrap" ref={moreRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            className="ai-fill-cmd-btn"
            aria-label={tg('ai.moreMenu')}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            …
          </button>
          {moreOpen ? (
            <div className="titlebar-popover" style={{ right: 0, left: 'auto', minWidth: 140 }}>
              <button type="button" role="menuitem" disabled={busy} onClick={() => { setMoreOpen(false); clearConversation() }}>
                {tg('ai.clear')}
              </button>
              <button type="button" role="menuitem" disabled={busy || lines.length === 0} onClick={() => { setMoreOpen(false); undoLastRound() }} title={tg('ai.undoTip')}>
                {tg('ai.undo')}
              </button>
            </div>
          ) : null}
        </div>
        </div>
        {workingGoal ? (
          <div className="ai-working-goal" title={workingGoal} data-testid="ai-working-goal">
            <span className="ai-working-goal-label">{tg('wm.goal')}</span>
            <span className="ai-working-goal-text">{workingGoal}</span>
          </div>
        ) : null}
      </div>

<div className="ai-messages">
        {lines.length === 0 && (
          <div className="msg assistant ai-structured ai-card-plain" data-testid="ai-reply-card" data-card="plain" style={{ opacity: 0.85 }}>
            {tg('ux64.emptyHint')}
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
              <div key={i} className="msg assistant ai-structured ai-card-streaming" data-testid="ai-reply-card" data-card="streaming">
                {tg('ux64.streaming')}
              </div>
            )
          }
          if (l.variant === 'error') {
            return (
              <div key={i} className="msg assistant ai-structured ai-card-error" data-testid="ai-reply-card" data-card="error">
                <div className="ai-reply-desc">{l.content}</div>
                {l.detail && l.detail !== l.content ? (
                  <details className="pf5-details">
                    <summary>{tg('pf5.details')}</summary>
                    <pre>{l.detail}</pre>
                  </details>
                ) : null}
                <div className="ai-reply-actions">
                  <button type="button" className="ai-fill-cmd-btn ai-btn-agree" disabled={busy} onClick={retryLastUser}>
                    {tg('ux64.retry')}
                  </button>
                  <button type="button" className="ai-fill-cmd-btn ai-btn-decline" disabled={busy} title={tg('ux64.clear')} onClick={clearConversation}>
                    <span className="ai-btn-text">{tg('ux64.clear')}</span>
                  </button>
                </div>
              </div>
            )
          }
          if (l.structured) {
            const s = l.structured
            const isConfirmable = Boolean(l.requestId && pendingConfirm?.requestId === l.requestId)
            const isSnapshot = !s.toolName || s.toolName === 'get_terminal_snapshot'
            if (s.action === 'tool_call' && !l.requestId) {
              return (
                <div key={i} className="msg assistant ai-structured ai-tool-strip" data-testid="ai-reply-card" data-card="tool">
                  {isSnapshot ? (
                    <span>
                      {tg('ux64.toolAutoSnapshot')}
                      {s.toolName ? (
                        <>
                          : <code>{s.toolName}</code>
                        </>
                      ) : null}
                    </span>
                  ) : (
                    <>
                      <span>
                        <HighlightedText text={s.description} />
                      </span>
                      <code>{s.toolName}</code>
                    </>
                  )}
                </div>
              )
            }
            const card =
              s.action === 'command' ? 'command' : s.action === 'tool_call' ? 'tool' : 'conclusion'
            const showRisk = s.action === 'end' || s.action === 'command' || Boolean(l.requestId)
            return (
              <div key={i} className="msg assistant ai-structured" data-testid="ai-reply-card" data-card={card}>
                <div className="ai-reply-desc">
                  <HighlightedText text={s.description} />
                </div>
                {showRisk ? <RiskBadge level={s.riskLevel} /> : null}
                {s.notes ? (
                  <div className="ai-reply-notes">
                    <HighlightedText text={s.notes} />
                  </div>
                ) : null}
                {s.action === 'tool_call' && l.requestId ? (
                  <div className="ai-reply-cmd">
                    <div className="ai-tool-need">
                      {tg('ux64.toolNeed')}
                      <code>{s.toolName ?? '—'}</code>
                      {s.toolInput?.maxLines ? (
                        <span style={{ marginLeft: 8 }}>
                          {tg('ui.0')}
                          {s.toolInput.maxLines}
                        </span>
                      ) : null}
                    </div>
                    {l.decision === 'agreed' ? (
                      <div className="ai-decision">{tg('ux64.executed')}</div>
                    ) : l.decision === 'skipped' ? (
                      <div className="ai-decision">{tg('ux64.skipped')}</div>
                    ) : (
                      <div className="ai-reply-actions">
                        <button type="button" className="ai-fill-cmd-btn ai-btn-agree" disabled={!isConfirmable} onClick={() => confirmStep(l.requestId!, true)}>
                          {tg('ux64.agreeContinue')}
                        </button>
                        <button type="button" className="ai-fill-cmd-btn ai-btn-decline" disabled={!isConfirmable} title={tg('ux64.disagree')} onClick={() => confirmStep(l.requestId!, false)}>
                          <span className="ai-btn-text">{tg('ux64.disagree')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {s.action === 'command' && s.command?.trim() ? (
                  <div className="ai-reply-cmd">
                    <code className="ai-reply-cmd-code">{s.command}</code>
                    {l.decision === 'agreed' ? (
                      <div className="ai-decision">{tg('ux64.executed')}</div>
                    ) : l.decision === 'skipped' ? (
                      <div className="ai-decision">{tg('ux64.skipped')}</div>
                    ) : l.requestId ? (
                      <div className="ai-reply-actions">
                        <span className="ai-btn-wrap" title={!activeSessionId ? tg('ux64.noSession') : undefined}>
                          <button
                            type="button"
                            className="ai-fill-cmd-btn ai-btn-agree"
                            disabled={!isConfirmable || !activeSessionId}
                            onClick={() => confirmStep(l.requestId!, true)}
                          >
                            {tg('ux64.agreeRun')}
                          </button>
                        </span>
                        <button
                          type="button"
                          className="ai-fill-cmd-btn ai-btn-decline"
                          disabled={!isConfirmable}
                          title={tg('ux64.disagree')}
                          onClick={() => confirmStep(l.requestId!, false)}
                        >
                          <span className="ai-btn-text">{tg('ux64.disagree')}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="ai-reply-actions">
                        <span className="ai-btn-wrap" title={!activeSessionId ? tg('ux64.noSession') : tg('ai.runTip')}>
                          <button
                            type="button"
                            className="ai-fill-cmd-btn ai-btn-agree"
                            disabled={!activeSessionId}
                            onClick={() => {
                              runSuggestedCommand(s.command!)
                              markDecision(i, 'agreed')
                            }}
                          >
                            {tg('ux64.agreeRun')}
                          </button>
                        </span>
                        <button
                          type="button"
                          className="ai-fill-cmd-btn ai-btn-decline"
                          title={tg('ux64.disagree')}
                          onClick={() => markDecision(i, 'skipped')}
                        >
                          <span className="ai-btn-text">{tg('ux64.disagree')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                {s.action === 'end' ? (
                  <div className="ai-reply-actions">
                    <button
                      type="button"
                      className="ai-fill-cmd-btn ai-btn-decline"
                      onClick={() => void navigator.clipboard.writeText([s.description, s.notes].filter(Boolean).join('\n'))}
                    >
                      <span className="ai-btn-text">{tg('ux64.copy')}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            )
          }
          return (
            <div key={i} className="msg assistant ai-structured ai-card-plain" data-testid="ai-reply-card" data-card="plain">
              <div className="ai-reply-desc">
                <HighlightedText text={l.content} />
              </div>
              {l.parseMiss ? <div className="ai-parse-fallback">{tg('ux64.parseFallback')}</div> : null}
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
            {tg('ai.attachOutput')}
          </label>
          <button
            type="button"
            className="ai-fill-cmd-btn"
            disabled={!activeSessionId || busy || snapshotBusy}
            title={
              activeSessionId
                ? tg('ai.sendConsoleTip')
                : tg('ai.needTab')
            }
            onClick={() => void sendConsoleToAi()}
          >
            {snapshotBusy ? tg('ai.readingTerm') : tg('ai.sendConsole')}
          </button>
          {!activeSessionId && <span style={{ color: 'var(--muted)', fontSize: 12 }}>{tg('ai.needSsh')}</span>}
        </div>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tg('ai.placeholder')}
          title={tg('ai.inputTip')}
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
        <button type="button" className="primary" data-testid="ai-send" disabled={busy || !input.trim()} onClick={() => void send()}>
          {busy ? tg('ai.busy') : tg('ai.send')}
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
            {tg('common.copy')}
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
            {tg('common.paste')}
          </button>
        </div>
      ) : null}
            </>
      )}
    </aside>
  )
}
