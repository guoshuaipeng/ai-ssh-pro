import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { tg } from '../lib/i18n'
import { keysFor } from '@shared/keymap'
import { friendlyErrorMessage } from '../lib/friendly-error'
import type { AiAssistantReply, AiChatMessage, AiProvider } from '@shared/ipc'
import { normalizeAiChatMessage } from '@shared/ai-chat-history'
import { parseAiAssistantReply } from '@shared/ipc'
import { commandBundle, highlightKeyNumbers, layoutOpsReply, type OpsLayout } from '@shared/ai-reply-cards'
import { dispatchInjectTerminal } from '../lib/terminal-inject'
import { showToast } from '../lib/toast'
import { lastAssistantText } from '@shared/ai-last-reply'
import { currentTerminalSelection } from '../lib/terminal-selection'
import { lastErrorFor, lastErrorSessionId, requestAiExplain, requestSelectionExplain } from '../lib/ai-events'
import { confirmDialog, isDialogOpen } from '../lib/dialogs'
import { isHigherChromeOpen } from '@shared/overlay-stack'
import { visibleWorkingGoal } from '@shared/working-memory-view'
import { effectiveSafetyTier, isSafetyTier, releaseSessionInFlight, SAFETY_TIERS, type SafetyMode, type SafetySettings } from '@shared/safety-tier'
import { safetyBandTone, safetyLadderBand } from '@shared/safety-visibility'
import AiConfigCard from './AiConfigCard'
import { SCREENSHOT_EVENT, screenshotHooksEnabled } from '../lib/screenshot-hooks'
import SafetyCommandBar from './SafetyCommandBar'

export type AiPendingInfo = {
  requestId: string
  action: string
  preview: string
}

type Props = {
  activeSessionId: string | null
  /** Stable key for persisted chat history (e.g. saved profile id); falls back to session id */
  historyKey?: string | null
  hostInventoryId?: string | null
  inventoryLookup?: { host?: string; port?: number; profileId?: string } | null
  /** Saved profile protection. Production hosts do not take autopilot unless allow-listed. */
  production?: boolean
  hostName?: string | null
  onOpenSettings?: () => void
  /** When Agree needs an SSH tab: focus a live session or open New connection. */
  onNeedSession?: () => void
  /** Restore a Core-A wait after the AI pane was hidden/unmounted. */
  initialPending?: AiPendingInfo | null
  /** Keep App (status bar) in sync with the waiting confirm. */
  onPendingChange?: (info: AiPendingInfo | null) => void
  /** Bump to scroll/focus the pending dock/card (status-bar chip). */
  focusPendingToken?: number
}

type UserLine = { role: 'user'; content: string }

type AssistantLine = {
  role: 'assistant'
  content: string
  streaming?: boolean
  structured?: AiAssistantReply
  /** 新交互协议下：需要用户确认后才能继续的 requestId */
  requestId?: string
  /** Safety-tier decision from the agent. Absent on a plain suggestion. */
  safetyMode?: SafetyMode
  /** Arrived this turn. History reload is not fresh, so it does not auto-run again. */
  fresh?: boolean
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
  return (
    <div className={`ai-risk-badge ${riskClass(n)}`} data-risk={n}>
      {tg('ux64.risk', { level: n })}
    </div>
  )
}

function OpsReply({
  text,
  badge,
  confirm,
  decision,
  canRun,
  onAgree,
  onDecline,
  commandBar
}: {
  text: string
  badge?: boolean
  confirm?: boolean
  decision?: 'agreed' | 'skipped'
  canRun?: boolean
  onAgree?: (command: string) => void
  onDecline?: () => void
  commandBar?: (command: string) => ReactNode
}) {
  const layout: OpsLayout = layoutOpsReply(text)
  const structured = layout.blocks.some((b) => b.kind !== 'prose')
  if (!structured) {
    return (
      <div className="ai-reply-desc">
        <HighlightedText text={text} />
      </div>
    )
  }
  return (
    <div className="ai-ops-stack" data-testid="ai-ops-stack">
      {badge && layout.risk ? <RiskBadge level={layout.risk} /> : null}
      {layout.blocks.map((block, i) => {
        if (block.kind === 'prose') {
          return (
            <div key={i} className="ai-reply-desc">
              <HighlightedText text={block.text} />
            </div>
          )
        }
        if (block.kind === 'finding') {
          return (
            <div key={i} className={`ai-finding${block.risk ? ` ai-finding--${block.risk}` : ''}`} data-testid="ai-ops-finding">
              <div className="ai-finding-n">{block.n}</div>
              <div className="ai-finding-body">
                <HighlightedText text={block.text} />
              </div>
              {block.risk ? (
                <span className={`ai-risk-badge ai-finding-risk ${riskClass(block.risk)}`} data-risk={block.risk}>
                  {tg('ux64.risk', { level: block.risk })}
                </span>
              ) : null}
            </div>
          )
        }
        if (block.kind === 'conclusion') {
          return (
            <div key={i} className={`ai-ops-conclusion${block.risk ? ` ai-finding--${block.risk}` : ''}`} data-testid="ai-ops-conclusion">
              <HighlightedText text={block.text} />
            </div>
          )
        }
        const bundle = commandBundle(block.commands)
        const showActions = confirm && block.confirm
        return (
          <div key={i} className="ai-reply-cmd" data-testid="ai-ops-commands">
            <code className="ai-reply-cmd-code">{block.commands.join('\n')}</code>
            {showActions ? (
              commandBar ? (
                commandBar(bundle)
              ) : decision === 'agreed' ? (
                <div className="ai-decision">{tg('ux64.executed')}</div>
              ) : decision === 'skipped' ? (
                <div className="ai-decision">{tg('ux64.skipped')}</div>
              ) : (
                <div className="ai-reply-actions">
                  <span className="ai-btn-wrap" title={!canRun ? tg('ux64.noSession') : tg('ai.runTip')}>
                    <button type="button" className="ai-fill-cmd-btn ai-btn-agree" disabled={!canRun} onClick={() => onAgree?.(bundle)}>
                      {tg('ux64.agreeRun')}
                    </button>
                  </span>
                  <button type="button" className="ai-fill-cmd-btn ai-btn-decline" title={tg('ux64.disagree')} onClick={() => onDecline?.()}>
                    <span className="ai-btn-text">{tg('ux64.disagree')}</span>
                  </button>
                </div>
              )
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function resolveHistoryKey(historyKey: string | null | undefined, activeSessionId: string | null): string | null {
  const k = historyKey?.trim() || activeSessionId?.trim() || ''
  return k || null
}

function linesToHistoryMessages(lines: Line[]): AiChatMessage[] {
  return lines
    .filter((l) => !('streaming' in l && l.streaming))
    .map((l) => {
      if (l.role === 'user') return { role: 'user' as const, content: l.content }
      const row: AiChatMessage = { role: 'assistant', content: l.content }
      if (l.requestId) row.requestId = l.requestId
      if (l.structured) row.structured = l.structured
      if (l.safetyMode) row.safetyMode = l.safetyMode
      if (l.decision) row.decision = l.decision
      if (l.parseMiss) row.parseMiss = true
      return row
    })
}

function historyToLines(messages: AiChatMessage[]): Line[] {
  const out: Line[] = []
  for (const raw of messages) {
    const m = normalizeAiChatMessage(raw)
    if (!m) continue
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
      continue
    }
    if (m.role !== 'assistant') continue
    const row: AssistantLine = {
      role: 'assistant',
      content: m.content,
      // History reload is not fresh — do not auto-run.
      fresh: false
    }
    if (m.requestId) row.requestId = m.requestId
    if (m.structured) row.structured = m.structured
    if (m.safetyMode) row.safetyMode = m.safetyMode as AssistantLine['safetyMode']
    if (m.decision) row.decision = m.decision
    if (m.parseMiss) row.parseMiss = true
    out.push(row)
  }
  return out
}

export default function AIPanel({
  activeSessionId,
  historyKey = null,
  hostInventoryId = null,
  inventoryLookup = null,
  production = false,
  hostName = null,
  onOpenSettings,
  onNeedSession,
  initialPending = null,
  onPendingChange,
  focusPendingToken = 0
}: Props) {
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [includeTerminal, setIncludeTerminal] = useState(true)
  const [pendingConfirm, setPendingConfirm] = useState<{ requestId: string; action: AiAssistantReply['action'] } | null>(() =>
    initialPending
      ? { requestId: initialPending.requestId, action: initialPending.action as AiAssistantReply['action'] }
      : null
  )
  const [pendingPreviewHold, setPendingPreviewHold] = useState(() => initialPending?.preview?.trim() || '')

  const screenshotForceKeyRef = useRef(false)
  useEffect(() => {
    const onShot = (ev: Event) => {
      if (!screenshotHooksEnabled()) return
      const detail = (ev as CustomEvent<{ op?: string; preview?: string; requestId?: string; action?: string }>).detail
      if (!detail || detail.op !== 'aiConfirm') return
      // Demo userdata often has no API key; empty-state UI hides the confirm dock.
      screenshotForceKeyRef.current = true
      setHasApiKey(true)
      const requestId = (detail.requestId || 'screenshot-confirm').trim() || 'screenshot-confirm'
      const preview = (detail.preview || 'systemctl status nginx --no-pager').trim()
      setPendingConfirm({ requestId, action: (detail.action as AiAssistantReply['action']) || 'command' })
      setPendingPreviewHold(preview)
      setLines((prev) => {
        if (prev.some((l) => l.role === 'assistant' && l.requestId === requestId)) return prev
        return [
          ...prev,
          {
            role: 'assistant',
            content: preview,
            requestId,
            fresh: true,
            structured: {
              action: 'command',
              description: 'Screenshot demo confirm',
              riskLevel: 'medium',
              command: preview
            }
          }
        ]
      })
    }
    window.addEventListener(SCREENSHOT_EVENT, onShot)
    return () => window.removeEventListener(SCREENSHOT_EVENT, onShot)
  }, [])
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
  const pendingAgreeRef = useRef<HTMLButtonElement>(null)
  const pendingNeedSessionRef = useRef<HTMLButtonElement>(null)
  const pendingDeclineRef = useRef<HTMLButtonElement>(null)
  const [inputMenu, setInputMenu] = useState<{ x: number; y: number } | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [workingGoal, setWorkingGoal] = useState<string | null>(null)
  const [safetySettings, setSafetySettings] = useState<SafetySettings>({ safetyTier: 'confirm' })
  const seenConfirm = useRef(new Set<string>())
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
        setSafetySettings(s)
        const ready = Boolean(p?.apiKey?.trim()) || screenshotForceKeyRef.current
        setHasApiKey(ready)
        if (sawSettings.current && !hadKey.current && ready && !screenshotForceKeyRef.current) showToast(tg('ux37.ready'))
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
    // Keep screenshot/demo pending dock across history reloads.
    if (!screenshotForceKeyRef.current) setPendingConfirm(null)
    if (!persistKey) {
      if (!screenshotForceKeyRef.current) setLines([])
      return
    }
    void window.aiss.ai.getChatHistory(persistKey).then((msgs) => {
      if (cancelled) return
      if (screenshotForceKeyRef.current) {
        setLines((prev) => {
          const hist = historyToLines(msgs)
          const demo = prev.filter((l) => l.role === 'assistant' && String(l.requestId || '').startsWith('screenshot'))
          return demo.length ? [...hist, ...demo] : hist.length ? hist : prev
        })
        return
      }
      setLines(historyToLines(msgs))
    })
    return () => {
      cancelled = true
    }
  }, [persistKey])

  // Keep dock in sync when App restores/seeds a pending AI approval (status bar / screenshot hooks).
  useEffect(() => {
    if (!initialPending?.requestId) return
    setPendingConfirm({
      requestId: initialPending.requestId,
      action: initialPending.action as AiAssistantReply['action']
    })
    if (initialPending.preview?.trim()) setPendingPreviewHold(initialPending.preview.trim())
  }, [initialPending?.requestId, initialPending?.action, initialPending?.preview])

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

  // Keep the waiting confirm card in view, and surface a dock above the composer.
  useEffect(() => {
    if (!pendingConfirm?.requestId) return
    const el = document.querySelector(`[data-confirm-id="${pendingConfirm.requestId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [pendingConfirm?.requestId])

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
      releaseSessionInFlight(persistKey)
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
            requestId: ev.requestId,
            safetyMode: ev.safetyMode,
            fresh: true
          }
          if (last?.role === 'assistant' && last.streaming && !last.structured) {
            next[next.length - 1] = row
          } else {
            next.push(row)
          }
          // Persist step fields so remount can restore the confirm card.
          queueMicrotask(() => persistHistory(next))
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
          : undefined,
        safetyContext: {
          production,
          hostId: inventoryLookup?.profileId || hostInventoryId || undefined,
          hostName: hostName || inventoryLookup?.host,
          sessionId: persistKey || undefined
        }
      })
      if (!usedStepProtocol) {
        const raw = assistant.trim()
        const parsed = parseAiAssistantReply(raw)
        setLines((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            if (parsed) {
              next[next.length - 1] = { role: 'assistant', content: raw, structured: parsed, fresh: true }
            } else {
              next[next.length - 1] = {
                role: 'assistant',
                content: raw || tg('ai.badJson'),
                parseMiss: true,
                fresh: true
              }
            }
          } else if (last?.role === 'user') {
            if (raw) {
              if (parsed) next.push({ role: 'assistant', content: raw, structured: parsed, fresh: true })
              else next.push({ role: 'assistant', content: raw, parseMiss: true, fresh: true })
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
    [activeSessionId, hostInventoryId, hostName, inventoryLookup, lines, persistHistory, persistKey, production, refreshWorkingGoal]
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
    if (seenConfirm.current.has(requestId)) return
    seenConfirm.current.add(requestId)
    setPendingConfirm(null)
    setLines((prev) => {
      const next = prev.map((row) =>
        row.role === 'assistant' && row.requestId === requestId
          ? { ...row, decision: (ok ? 'agreed' : 'skipped') as 'agreed' | 'skipped' }
          : row
      )
      queueMicrotask(() => persistHistory(next))
      return next
    })
    try {
      await window.aiss.ai.confirmStep(requestId, ok)
    } finally {
      // Dock unmounts with the focused button — return caret to the composer.
      queueMicrotask(() => inputRef.current?.focus())
    }
  }, [persistHistory])

  // Esc declines / Enter agrees on the dock — never when a dialog, menu, or palette is in front.
  useEffect(() => {
    if (!pendingConfirm?.requestId) return
    const requestId = pendingConfirm.requestId
    const action = pendingConfirm.action
    const onKey = (e: KeyboardEvent) => {
      if (isDialogOpen()) return
      if (isHigherChromeOpen(document)) return
      if (document.querySelector('.modal-backdrop')) return
      // Product overlays (welcome / tour / quick start) own Esc first.
      if (document.querySelector('.welcome-stage, .tour-root, .ux60-layer, [data-testid="ux60"], [data-testid="first-week"]')) return
      if (e.key === 'Escape') {
        const tgt = e.target as HTMLElement | null
        // Composer Esc stays with the textarea (clear/blur). Other inputs do not block decline.
        if (tgt?.closest?.('.ai-input-row')) return
        e.preventDefault()
        e.stopPropagation()
        void confirmStep(requestId, false)
        return
      }
      if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement | null
      if (!target?.closest?.('.ai-pending-confirm')) return
      // Native button activation already handles focused Agree/Decline/CTA.
      if (target.closest('button, a, [role="button"]')) return
      e.preventDefault()
      e.stopPropagation()
      const needsSession = action !== 'tool_call' && !activeSessionId
      if (needsSession) {
        onNeedSession?.()
        return
      }
      void confirmStep(requestId, true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pendingConfirm, activeSessionId, confirmStep, onNeedSession])

  // Focus the dock control once per pending id (skip if typing in the composer).
  useEffect(() => {
    if (!pendingConfirm?.requestId) return
    if (isDialogOpen() || isHigherChromeOpen(document) || document.querySelector('.modal-backdrop')) return
    if (document.querySelector('.welcome-stage, .tour-root, .ux60-layer, [data-testid="ux60"], [data-testid="first-week"]')) return
    const ae = document.activeElement as HTMLElement | null
    if (ae?.closest?.('.ai-input-row')) return
    const needsSession = pendingConfirm.action !== 'tool_call' && !activeSessionId
    const btn = needsSession ? pendingNeedSessionRef.current : pendingAgreeRef.current
    // Defer so the dock is mounted; do not yank focus if the user started typing meanwhile.
    const id = window.setTimeout(() => {
      const now = document.activeElement as HTMLElement | null
      if (now?.closest?.('.ai-input-row')) return
      btn?.focus()
    }, 0)
    return () => window.clearTimeout(id)
  }, [pendingConfirm?.requestId, pendingConfirm?.action, activeSessionId])

  // Tell App when a confirm is waiting so the status bar can surface it while AI is hidden.
  useEffect(() => {
    if (!pendingConfirm?.requestId) {
      setPendingPreviewHold('')
      onPendingChange?.(null)
      return
    }
    const line = linesRef.current.find(
      (l): l is AssistantLine =>
        l.role === 'assistant' && Boolean(l.requestId) && l.requestId === pendingConfirm.requestId
    )
    const structured = line?.structured
    const preview = (
      structured?.command?.trim() ||
      (structured?.toolName ? structured.toolName : '') ||
      structured?.description?.trim() ||
      line?.content?.trim() ||
      pendingPreviewHold ||
      ''
    ).replace(/\s+/g, ' ')
    if (preview) {
      setPendingPreviewHold((prev) => (prev === preview ? prev : preview))
    }
    onPendingChange?.({
      requestId: pendingConfirm.requestId,
      action: String(pendingConfirm.action),
      preview: preview || pendingPreviewHold
    })
  }, [pendingConfirm, lines, onPendingChange, pendingPreviewHold])

  // Status-bar chip: open AI → bump token → scroll dock/card into view.
  useEffect(() => {
    if (!focusPendingToken || !pendingConfirm?.requestId) return
    const id = pendingConfirm.requestId
    const card = document.querySelector(`[data-confirm-id="${id}"]`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const dock = document.querySelector<HTMLElement>('[data-testid="ai-pending-confirm"]')
    dock?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const needsSession = pendingConfirm.action !== 'tool_call' && !activeSessionId
    const btn = needsSession ? pendingNeedSessionRef.current : pendingAgreeRef.current
    window.setTimeout(() => {
      const ae = document.activeElement as HTMLElement | null
      if (ae?.closest?.('.ai-input-row')) return
      btn?.focus()
    }, 0)
  }, [focusPendingToken, pendingConfirm?.requestId, pendingConfirm?.action, activeSessionId])


  const markDecision = useCallback((index: number, decision: 'agreed' | 'skipped') => {
    setLines((prev) => {
      const next = prev.map((row, idx) => (idx === index && row.role === 'assistant' ? { ...row, decision } : row))
      queueMicrotask(() => persistHistory(next))
      return next
    })
  }, [persistHistory])

  const retryLastUser = useCallback(() => {
    if (busy) {
      showToast(tg('ai.busyWait'), { kind: 'error' })
      return
    }
    const prev = linesRef.current
    for (let i = prev.length - 1; i >= 0; i--) {
      const row = prev[i]
      if (row?.role === 'user' && row.content.trim()) {
        void submitToAi(row.content)
        return
      }
    }
    showToast(tg('ai.noLastAsk'), { kind: 'error' })
  }, [busy, submitToAi])

  /** Stale confirm: put the prior user ask back in the composer (no auto-send). */
  const refillAskBefore = useCallback((assistantIndex: number) => {
    const prev = linesRef.current
    for (let i = assistantIndex - 1; i >= 0; i--) {
      const row = prev[i]
      if (row?.role === 'user' && row.content.trim()) {
        setInput(row.content)
        queueMicrotask(() => {
          const el = inputRef.current
          if (!el) return
          el.focus()
          el.setSelectionRange(0, el.value.length)
        })
        return
      }
    }
    // No prior user line — toast and focus empty composer.
    showToast(tg('ai.noLastAsk'), { kind: 'error' })
    queueMicrotask(() => inputRef.current?.focus())
  }, [])

  // CmdK / menu: Ask again → fill last user ask (no auto-send).
  useEffect(() => {
    const onAsk = () => {
      const prev = linesRef.current
      for (let i = prev.length - 1; i >= 0; i--) {
        const row = prev[i]
        if (row?.role === 'user' && row.content.trim()) {
          setInput(row.content)
          queueMicrotask(() => {
            const el = inputRef.current
            if (!el) return
            el.focus()
            el.setSelectionRange(0, el.value.length)
          })
          return
        }
      }
      showToast(tg('ai.noLastAsk'), { kind: 'error' })
      queueMicrotask(() => inputRef.current?.focus())
    }
    window.addEventListener('aiss-ai-ask-again', onAsk)
    return () => window.removeEventListener('aiss-ai-ask-again', onAsk)
  }, [])

  const stopGeneration = useCallback(() => {
    void window.aiss.ai.abortChat()
  }, [])

  const clearConversation = useCallback(() => {
    if (busy) {
      showToast(tg('ai.clearBusy'), { kind: 'error' })
      return
    }
    if (!linesRef.current.length) {
      showToast(tg('ai.chatAlreadyEmpty'))
      return
    }
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

  useEffect(() => {
    const onClear = () => clearConversation()
    window.addEventListener('aiss-ai-clear-chat', onClear)
    return () => window.removeEventListener('aiss-ai-clear-chat', onClear)
  }, [clearConversation])

  useEffect(() => {
    const onCopy = () => {
      const text = lastAssistantText(linesRef.current)
      if (!text) {
        showToast(tg('ai.noLastReply'), { kind: 'error' })
        return
      }
      void navigator.clipboard.writeText(text).then(
        () => showToast(tg('ai.copiedLastReply')),
        () => showToast(tg('ai.copyFailed'), { kind: 'error' })
      )
    }
    window.addEventListener('aiss-ai-copy-last-reply', onCopy)
    return () => window.removeEventListener('aiss-ai-copy-last-reply', onCopy)
  }, [])

  const undoLastRound = useCallback(() => {
    if (busy) {
      showToast(tg('ai.busyWait'), { kind: 'error' })
      return
    }
    if (!linesRef.current.length) {
      showToast(tg('ai.nothingToUndo'))
      return
    }
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

  const saveScope = (field: 'safetyTierSessions' | 'safetyTierHosts', id: string | null | undefined, value: string) => {
    const key = id?.trim() ?? ''
    if (!key) return
    const current = { ...(safetySettings[field] ?? {}) }
    if (!value) delete current[key]
    else if (isSafetyTier(value)) current[key] = value
    setSafetySettings((prev) => ({ ...prev, [field]: current }))
    void window.aiss.ai.setSettings({ [field]: current })
  }

  const commandActions = (opts: {
    command: string
    riskLevel?: string | null
    safetyMode?: SafetyMode
    requestId?: string
    fresh?: boolean
    decision?: 'agreed' | 'skipped'
    confirmable?: boolean
    agreeLabel?: string
    onAgree: (command: string) => void
    onDecline: () => void
    onAskAgain?: () => void
  }) => (
    <SafetyCommandBar
      {...opts}
      canRun={Boolean(activeSessionId)}
      sessionKey={persistKey}
      hostId={inventoryLookup?.profileId || hostInventoryId}
      hostName={hostName || inventoryLookup?.host}
      production={production}
      settings={safetySettings}
    />
  )

  const hostKey = inventoryLookup?.profileId || hostInventoryId || ''
  const sessionTier = persistKey ? safetySettings.safetyTierSessions?.[persistKey] : undefined
  const hostTier = hostKey ? safetySettings.safetyTierHosts?.[hostKey] : undefined
  const effectiveTier = effectiveSafetyTier(safetySettings, { hostId: hostKey, sessionId: persistKey })
  const ladderBand = safetyLadderBand(effectiveTier)

  const pendingLine =
    pendingConfirm == null
      ? null
      : lines.find(
          (l): l is AssistantLine =>
            l.role === 'assistant' && Boolean(l.requestId) && l.requestId === pendingConfirm.requestId
        ) ?? null
  const pendingStructured = pendingLine?.structured
  const pendingPreviewRaw = (
    pendingStructured?.command?.trim() ||
    (pendingStructured?.toolName ? pendingStructured.toolName : '') ||
    pendingStructured?.description?.trim() ||
    pendingLine?.content?.trim() ||
    pendingPreviewHold ||
    ''
  ).replace(/\s+/g, ' ')
  const pendingPreviewTruncated = pendingPreviewRaw.length > 120
  const pendingPreview = pendingPreviewTruncated ? `${pendingPreviewRaw.slice(0, 117)}…` : pendingPreviewRaw
  const pendingIsTool = pendingConfirm?.action === 'tool_call'
  const pendingAgreeLabel = pendingIsTool ? tg('ux64.agreeContinue') : tg('ux64.agreeRun')
  const revealPendingCard = () => {
    if (!pendingConfirm?.requestId) return
    const card = document.querySelector(`[data-confirm-id="${pendingConfirm.requestId}"]`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

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
        <span className="ai-header-shortcut" data-testid="ai-focus-shortcut-hint" title={tg('ai.focusShortcutTip')}>
          <kbd>{keysFor('focusAiPanel') ?? 'Ctrl+Shift+A'}</kbd>
        </span>
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
              <button
                type="button"
                role="menuitem"
                data-testid="ai-explain-last-error"
                disabled={busy}
                onClick={() => {
                  setMoreOpen(false)
                  const sid = currentTerminalSelection()?.sessionId || lastErrorSessionId()
                  const text = lastErrorFor(sid) ?? lastErrorFor(null)
                  const target = lastErrorFor(sid) ? sid : lastErrorSessionId()
                  if (!text || !target) {
                    showToast(tg('a1.noError'), { kind: 'error' })
                    return
                  }
                  requestAiExplain({ sessionId: target, text, source: 'auto' })
                }}
              >
                {tg('a1.title')}
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="ai-explain-selection"
                disabled={busy}
                onClick={() => {
                  setMoreOpen(false)
                  const sel = currentTerminalSelection()
                  void requestSelectionExplain({ sessionId: sel?.sessionId ?? '', text: sel?.text ?? '' }).then((status) => {
                    if (status === 'empty') showToast(tg('a6.needSelection'), { kind: 'error' })
                  })
                }}
              >
                {tg('a1.explainSelection')}
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="ai-copy-last-reply"
                disabled={busy || !lastAssistantText(lines)}
                onClick={() => {
                  setMoreOpen(false)
                  const text = lastAssistantText(lines)
                  if (!text) {
                    showToast(tg('ai.noLastReply'), { kind: 'error' })
                    return
                  }
                  void navigator.clipboard.writeText(text).then(
                    () => showToast(tg('ai.copiedLastReply')),
                    () => showToast(tg('ai.copyFailed'), { kind: 'error' })
                  )
                }}
              >
                {tg('ai.copyLastReply')}
              </button>
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
        <div
          className={`ai-session-context${!activeSessionId ? ' is-none' : ''}`}
          data-testid="ai-session-context"
          title={
            activeSessionId
              ? tg('ai.contextHostTip', { host: hostName || inventoryLookup?.host || '—' })
              : tg('ai.contextNoneTip')
          }
        >
          {activeSessionId ? (
            <>
              <span className="ai-session-context-label">{tg('ai.contextBound')}</span>
              <span className="ai-session-context-host">{hostName || inventoryLookup?.host || tg('ai.contextSession')}</span>
            </>
          ) : (
            <span className="ai-session-context-host">{tg('ai.contextNone')}</span>
          )}
        </div>
        {workingGoal ? (
          <div className="ai-working-goal" title={workingGoal} data-testid="ai-working-goal">
            <span className="ai-working-goal-label">{tg('wm.goal')}</span>
            <span className="ai-working-goal-text">{workingGoal}</span>
          </div>
        ) : null}
        <div className="ai-safety-row" data-testid="safety-scope">
          <span
            className={`safety-band-badge safety-band-${safetyBandTone(ladderBand)} is-active`}
            data-testid="safety-band-badge"
            data-band={ladderBand}
            title={tg('safety.ladderHint')}
          >
            {tg(`safety.band.${ladderBand}` as 'safety.band.confirm')}
          </span>
          <label>
            {tg('safety.session')}
            <select
              data-testid="safety-session"
              value={isSafetyTier(sessionTier) ? sessionTier : ''}
              onChange={(e) => saveScope('safetyTierSessions', persistKey, e.target.value)}
            >
              <option value="">{tg('safety.follow')}</option>
              {SAFETY_TIERS.map((id) => (
                <option key={id} value={id}>{tg(`safety.${id}` as 'safety.confirm')}</option>
              ))}
            </select>
          </label>
          <label>
            {tg('safety.host')}
            <select
              data-testid="safety-host"
              value={isSafetyTier(hostTier) ? hostTier : ''}
              disabled={!hostKey}
              onChange={(e) => saveScope('safetyTierHosts', hostKey, e.target.value)}
            >
              <option value="">{tg('safety.follow')}</option>
              {SAFETY_TIERS.map((id) => (
                <option key={id} value={id}>{tg(`safety.${id}` as 'safety.confirm')}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

<div className="ai-messages">
        {lines.length === 0 && (
          <div className="ai-reply-empty" data-testid="ai-reply-empty" role="status">
            <p>{tg('ux64.emptyHint')}</p>
            <div className="ai-starter-prompts" data-testid="ai-starter-prompts">
              {(['ux64.starterLoad', 'ux64.starterError', 'ux64.starterProcess'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="ai-starter-prompt"
                  data-testid={`ai-starter-${key.split('.').pop()}`}
                  onClick={() => {
                    setInput(tg(key))
                    queueMicrotask(() => inputRef.current?.focus())
                  }}
                >
                  {tg(key)}
                </button>
              ))}
            </div>
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
              <div key={i} className="msg assistant ai-structured ai-dark-card ai-card-streaming" data-testid="ai-reply-card" data-card="streaming">
                {tg('ux64.streaming')}
              </div>
            )
          }
          if (l.variant === 'error') {
            return (
              <div key={i} className="msg assistant ai-structured ai-dark-card ai-card-error" data-testid="ai-reply-card" data-card="error">
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
                <div key={i} className="msg assistant ai-structured ai-dark-card ai-tool-strip" data-testid="ai-reply-card" data-card="tool">
                  <span className="ai-tool-step">
                    {isSnapshot ? (
                      <>
                        {tg('ux64.toolAutoSnapshot')}
                        {s.toolName ? (
                          <>
                            {' '}
                            <code>{s.toolName}</code>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <HighlightedText text={s.description} />
                        {s.toolName ? (
                          <>
                            {' '}
                            <code>{s.toolName}</code>
                          </>
                        ) : null}
                      </>
                    )}
                  </span>
                </div>
              )
            }
            const card =
              s.action === 'command' ? 'command' : s.action === 'tool_call' ? 'tool' : 'conclusion'
            const showRisk = s.action === 'end' || s.action === 'command' || Boolean(l.requestId)
            return (
              <div
                key={i}
                className="msg assistant ai-structured ai-dark-card"
                data-testid="ai-reply-card"
                data-card={card}
                data-confirm-id={l.requestId || undefined}
              >
                {showRisk ? (
                  <div className="ai-card-head">
                    <RiskBadge level={s.riskLevel} />
                  </div>
                ) : null}
                <div className="ai-card-body">
                  <OpsReply text={s.description} confirm={false} />
                </div>
                {s.notes ? (
                  <div className="ai-reply-notes">
                    <OpsReply text={s.notes} confirm={false} />
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
                    ) : !isConfirmable ? (
                      <div className="ai-reply-actions ai-stale-actions" data-testid="ai-confirm-stale">
                        <span className="ai-decision">{tg('ux64.confirmStale')}</span>
                        <button
                          type="button"
                          className="ai-fill-cmd-btn"
                          data-testid="ai-ask-again"
                          onClick={() => refillAskBefore(i)}
                        >
                          {tg('ux64.askAgain')}
                        </button>
                      </div>
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
                    {commandActions({
                      command: s.command,
                      riskLevel: s.riskLevel,
                      safetyMode: l.safetyMode,
                      requestId: l.requestId,
                      fresh: l.fresh,
                      decision: l.decision,
                      confirmable: l.requestId ? isConfirmable : true,
                      onAgree: () => {
                        if (l.requestId) void confirmStep(l.requestId, true)
                        else {
                          runSuggestedCommand(s.command!)
                          markDecision(i, 'agreed')
                        }
                      },
                      onDecline: () => {
                        if (l.requestId) void confirmStep(l.requestId, false)
                        else markDecision(i, 'skipped')
                      },
                      onAskAgain: () => refillAskBefore(i)
                    })}
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
            <div key={i} className="msg assistant ai-structured ai-dark-card ai-card-plain" data-testid="ai-reply-card" data-card="plain">
              <OpsReply
                text={l.content}
                badge
                confirm
                decision={l.decision}
                canRun={Boolean(activeSessionId)}
                commandBar={(cmd) =>
                  commandActions({
                    command: cmd,
                    fresh: l.fresh,
                    decision: l.decision,
                    onAgree: (command) => {
                      runSuggestedCommand(command)
                      markDecision(i, 'agreed')
                    },
                    onDecline: () => markDecision(i, 'skipped')
                  })
                }
                onAgree={(cmd) => {
                  runSuggestedCommand(cmd)
                  markDecision(i, 'agreed')
                }}
                onDecline={() => markDecision(i, 'skipped')}
              />
              {l.parseMiss ? <div className="ai-parse-fallback">{tg('ux64.parseFallback')}</div> : null}
            </div>
          )
        })}
        <div ref={tailRef} />
      </div>

      {pendingConfirm ? (
        <div
          className="ai-pending-confirm"
          role="region"
          tabIndex={-1}
          aria-label={tg('ux64.pendingTitle')}
          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
        >
          <div className="ai-pending-confirm-main">
            <div className="ai-pending-confirm-title">{tg('ux64.pendingTitle')}</div>
            {pendingPreview ? (
              <code className="ai-pending-confirm-preview" title={pendingPreviewRaw}>
                {pendingPreview}
              </code>
            ) : null}
            {pendingPreviewTruncated && pendingLine ? (
              <button
                type="button"
                className="link-btn ai-pending-view-card"
                data-testid="ai-pending-view-card"
                onClick={revealPendingCard}
              >
                {tg('ux64.viewCard')}
              </button>
            ) : null}
          </div>
          <div className="ai-reply-actions ai-pending-confirm-actions">
            {!activeSessionId && !pendingIsTool ? (
              <>
                <span className="ai-pending-need-hint" data-testid="ai-pending-need-hint">
                  {tg('ux64.noSession')}
                </span>
                <button
                  type="button"
                  ref={pendingNeedSessionRef}
                  className="ai-fill-cmd-btn ai-btn-agree"
                  data-testid="ai-pending-need-session"
                  title={tg('ux64.needSessionCta')}
                  onClick={() => onNeedSession?.()}
                >
                  {tg('ux64.needSessionCta')}
                </button>
              </>
            ) : (
              <button
                type="button"
                ref={pendingAgreeRef}
                className="ai-fill-cmd-btn ai-btn-agree"
                data-testid="ai-pending-agree"
                title={pendingAgreeLabel}
                onClick={() => void confirmStep(pendingConfirm.requestId, true)}
              >
                {pendingAgreeLabel}
              </button>
            )}
            <button
              type="button"
              ref={pendingDeclineRef}
              className="ai-fill-cmd-btn ai-btn-decline"
              data-testid="ai-pending-decline"
              title={tg('ux64.disagree')}
              onClick={() => void confirmStep(pendingConfirm.requestId, false)}
            >
              <span className="ai-btn-text">{tg('ux64.disagree')}</span>
            </button>
          </div>
        </div>
      ) : null}

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
