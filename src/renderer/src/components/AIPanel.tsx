import { hasUsableKey } from '@shared/ai-presets'
import AiActionCard from './AiActionCard'
import type { ActionResult } from '@shared/ai-actions'
import { recallStep, userPrompts } from '@shared/ai-recall'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { tg } from '../lib/i18n'
import { keysFor } from '@shared/keymap'
import { friendlyError, friendlyErrorMessage } from '../lib/friendly-error'
import { aiErrorWantsSettings } from '@shared/ai-http-error'
import { aiEmptyGate, aiErrorPrimaryCta, aiNeedsModelPick } from '@shared/ai-empty-error'
import type { AiAssistantReply, AiChatMessage, AiProvider } from '@shared/ipc'
import { normalizeAiChatMessage } from '@shared/ai-chat-history'
import { parseAiAssistantReply } from '@shared/ipc'
import { appendAudit } from '@shared/audit-log'
import { commandBundle, highlightKeyNumbers, layoutOpsReply, splitFences, splitInlineCode, type OpsLayout } from '@shared/ai-reply-cards'
import { dispatchInjectTerminal } from '../lib/terminal-inject'
import { showToast } from '../lib/toast'
import { chatToMarkdown } from '@shared/ai-chat-markdown'
import { addPrompt, loadPrompts, savePrompts, AI_PROMPTS_MAX } from '@shared/ai-prompts'
import { buildPasteBlock, composeWithBlocks, shouldCollapsePaste, type PasteBlock } from '@shared/paste-block'
import { lastAssistantText } from '@shared/ai-last-reply'
import { currentTerminalSelection } from '../lib/terminal-selection'
import { fillCommandBar, lastErrorFor, lastErrorSessionId, requestAiExplain, requestSelectionExplain } from '../lib/ai-events'
import { AI_PREFILL_EVENT, takeAiPrefill } from '../lib/ai-prefill'
import { fillableCommand } from '@shared/ai-fill'
import { scriptSteps } from '@shared/ai-script'
import { startScript } from '../lib/ai-script-run'
import { blocksEnabled } from '@shared/terminal-blocks'
import { aiOrigins, aiPanelSession } from '../lib/ai-origin'
import { confirmDialog, isDialogOpen } from '../lib/dialogs'
import { isHigherChromeOpen } from '@shared/overlay-stack'
import { buildMemoryEvidenceView, visibleWorkingGoal, type MemoryEvidenceView } from '@shared/working-memory-view'
import { releaseSessionInFlight, type SafetyMode, type SafetySettings } from '@shared/safety-tier'
import { AI_POLICIES, isAiPolicy, policyTier, resolveAiPolicy, type AiPolicy } from '@shared/ai-policy'
import {
  alignPlanStepDisplay,
  buildSuggestionStepNos,
  collectSuggestionCommands,
  findConfirmableLineIndex,
  formatSuggestionCommandsForCopy
} from '@shared/ai-suggestion-steps'
import { safetyBandTone, safetyLadderBand } from '@shared/safety-visibility'
import AiConfigCard from './AiConfigCard'
import ExecReplay, { OPEN_AUDIT_EVENT, type OpenAiFromAuditDetail } from './ExecReplay'
import { OPEN_AI_POLICY_EVENT, prodAutoHint } from '@shared/prod-auto-hint'
import type { ExecRecord } from '@shared/ai-exec-replay'
import { buildAuditOpenAiMissToast, hasFailedExecPin } from '@shared/ai-audit-miss'
import { applyStreamDelta, finalizeStoppedLines } from '@shared/ai-stream-stop'
import { SCREENSHOT_AI_CHAT_DEMO, SCREENSHOT_EVENT, screenshotHooksEnabled } from '../lib/screenshot-hooks'
import SafetyCommandBar from './SafetyCommandBar'
import {
  archiveTitle,
  conversationLabel,
  GENERAL_CONVERSATION_KEY,
  groupArchives,
  isTroubleshootTitle,
  resumeCandidate,
  type AiArchiveSummary
} from '@shared/ai-conversation'
import { policyCapNote } from './HostSafetyCard'
import Button from './ui/Button'
import Icon from './Icon'
import type { ProtectionLevel } from '@shared/protection'
import { aiEffectiveLevel } from '@shared/ai-write-guard'

export type AiPendingInfo = {
  requestId: string
  action: string
  preview: string
}

type Props = {
  /** c53 AA1: runs a confirmed app action proposed by the AI. */
  onAppAction?: (name: string, values: Record<string, string>) => Promise<ActionResult> | ActionResult
  activeSessionId: string | null
  /** Stable key for persisted chat history (e.g. saved profile id); falls back to session id */
  historyKey?: string | null
  hostInventoryId?: string | null
  inventoryLookup?: { host?: string; port?: number; profileId?: string } | null
  /** Saved profile protection. Production hosts do not take autopilot unless allow-listed. */
  production?: boolean
  /** M20: full effective protection of the bound session (normal / production / readonly). */
  protection?: ProtectionLevel
  /** M20: inside the elevation window. */
  elevated?: boolean
  /** M21: the bound host's own AI policy (undefined = follow global). */
  hostPolicy?: AiPolicy
  /** M21: change the bound host's policy; absent when the tab has no saved host. */
  onSetHostPolicy?: (policy: AiPolicy | undefined) => void
  /** M23: the terminal tab this conversation is bound to (null = general Q&A, never executes). */
  conversation?: { group: string; n: number; hostLabel: string; status: 'connecting' | 'connected' | 'disconnected' } | null
  /** M23: connected terminal tabs the conversation can move to. */
  aiTargets?: ReadonlyArray<{ tabId: string; n: number; label: string; active: boolean }>
  onSelectTarget?: (tabId: string) => void
  onReconnect?: () => void
  /** M22: in-memory override for this tab only (cleared on close / disconnect). */
  tempPolicy?: AiPolicy
  onSetTempPolicy?: (policy: AiPolicy | undefined) => void
  /** M25: open the active host's 安全 settings card. */
  onOpenHostSafety?: () => void
  hostName?: string | null
  onOpenSettings?: () => void
  /** When Agree needs an SSH tab: focus a live session or open New connection. */
  onNeedSession?: () => void
  /** Restore a Core-A wait after the AI pane was hidden/unmounted. */
  initialPending?: AiPendingInfo | null
  /** Keep App (status bar) in sync with the waiting confirm. */
  onPendingChange?: (info: AiPendingInfo | null) => void
  /** M20: bring back the tab whose conversation still has a reply in flight. */
  onSwitchToConversation?: (historyKey: string) => void
  /** Bump to scroll/focus the pending dock/card (status-bar chip). */
  focusPendingToken?: number
  /** Round 17: bump after audit → AI jump to focus matching exec/command. */
  focusExecToken?: number
  focusExec?: OpenAiFromAuditDetail | null
}


/** Round 23: scroll + calm highlight when a confirm appears after 「带证据重试」. */
function focusAiPendingAfterFailure(requestId?: string | null) {
  const dock = document.querySelector<HTMLElement>('[data-testid="ai-pending-confirm"]')
  const card = requestId
    ? document.querySelector(`[data-confirm-id="${CSS.escape(requestId)}"]`)
    : null
  if (dock) {
    dock.classList.add('is-after-failure-focus')
    dock.setAttribute('data-after-failure-focus', '1')
    dock.setAttribute('data-after-evidence-retry', '1')
  }
  const target = dock || card
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (card && card !== target) card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    dock?.classList.remove('is-after-failure-focus')
    dock?.removeAttribute('data-after-failure-focus')
    dock?.removeAttribute('data-after-evidence-retry')
  }, 4200)
  const agree =
    document.querySelector<HTMLButtonElement>('[data-testid="ai-pending-agree"]') ||
    document.querySelector<HTMLButtonElement>('[data-testid="ai-pending-need-session"]')
  agree?.focus()
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
  /** Per-card Agree/Decline result. Auto-write follows resolveAiPolicy + planCommandConfirm, not the low-risk badge alone. */
  decision?: 'agreed' | 'skipped'
  /** 非结构化回复：仍用卡片壳，并提示未能识别步骤 */
  parseMiss?: boolean
  variant?: 'error'
  detail?: string
  /** Classified provider/HTTP code; drives settings vs retry primary CTA. */
  errorCode?: string
  /** M19: wall time of the turn, shown as the muted meta line. Not persisted. */
  elapsedMs?: number
  /** 2.3: execution replay (persisted). */
  exec?: ExecRecord
  /** H05: Stop finalized this card — show cancelled + Retry (new turn). */
  cancelled?: boolean
}

type Line = UserLine | AssistantLine

function riskClass(level: string): string {
  const n = level.toLowerCase()
  if (n === 'low') return 'ai-risk-low'
  if (n === 'high') return 'ai-risk-high'
  return 'ai-risk-medium'
}

/** Prose with `inline code` chips; metric highlighting runs on the non-code parts. */
function HighlightedText({ text }: { text: string }): ReactNode {
  const segs = splitInlineCode(text)
  if (!segs.some((s) => s.kind === 'code')) return <MetricText text={text} />
  return (
    <>
      {segs.map((s, i) =>
        s.kind === 'code' ? (
          <code key={i} className="ai-inline-code">
            {s.text}
          </code>
        ) : (
          <MetricText key={i} text={s.text} />
        )
      )}
    </>
  )
}

function AiCodeBlock({ code, lang }: { code: string; lang: string }) {
  const fill = fillableCommand(code, lang)
  const steps = fill ? null : scriptSteps(code, lang)
  return (
    <div className="ai-code-block" data-testid="ai-code-block" data-lang={lang || undefined}>
      <div className="ai-code-head">
        <span className="ai-code-lang">{lang || 'text'}</span>
        <button
          type="button"
          className="ai-code-copy"
          onClick={() =>
            void navigator.clipboard.writeText(code).then(
              () => showToast(tg('ctx.copied')),
              () => showToast(tg('ai.copyFailed'), { kind: 'error' })
            )
          }
        >
          {tg('common.copy')}
        </button>
        {fill ? (
          <button
            type="button"
            className="ai-code-copy ai-code-fill"
            data-testid="ai-code-fill"
            title={tg('d16.fillTip')}
            onClick={() => {
              const sid = aiPanelSession.current
              if (!sid) {
                showToast(tg('d16.noSession'))
                return
              }
              aiOrigins.mark(sid, fill)
              fillCommandBar(sid, fill)
              showToast(tg(blocksEnabled() ? 'd15.filled' : 'd16.needBlocks'))
            }}
          >
            {tg('d16.fill')}
          </button>
        ) : null}
        {steps ? (
          <button
            type="button"
            className="ai-code-copy ai-code-fill"
            data-testid="ai-code-steps"
            title={tg('d16b.tip')}
            onClick={() => {
              const sid = aiPanelSession.current
              if (!sid) {
                showToast(tg('d16.noSession'))
                return
              }
              startScript(sid, steps)
            }}
          >
            {tg('d16b.fill', { n: steps.length })}
          </button>
        ) : null}
      </div>
      <pre className="ai-code-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function MetricText({ text }: { text: string }): ReactNode {
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
    <span className={`ai-risk-badge ai-risk-tag ${riskClass(n)}`} data-risk={n}>
      {tg('ux64.risk', { level: n })}
    </span>
  )
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => showToast(tg('ctx.copied')),
    () => showToast(tg('ai.copyFailed'), { kind: 'error' })
  )
}

/** M19: the description repeats the suggested command (or a prefix of it). Show it once, in the command block. */
function coveredBy(skip: string | undefined, commands: string[]): boolean {
  const k = skip?.trim()
  if (!k) return false
  const rows = commands.map((c) => c.trim()).filter(Boolean)
  return rows.length > 0 && rows.every((c) => k.includes(c))
}

/** M19: chip label for a model id — drop the vendor path, cap the length; the full id is the tooltip. */
/** M25: arrow / Home / End / Escape navigation inside a chip popover menu. */
function menuKeyNav(e: React.KeyboardEvent<HTMLElement>, close: () => void): void {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"], .ai-safety-link'))
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
    return
  }
  if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  const i = items.indexOf(document.activeElement as HTMLElement)
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
  items[next]?.focus()
}

export function shortModelName(model: string, max = 14): string {
  const base = model.split('/').pop()?.trim() || model.trim()
  return base.length > max ? `${base.slice(0, max - 1)}…` : base
}

/** M19 (Cursor-style): muted line under a reply — elapsed time + copy icon. */
function ReplyMeta({ text, elapsedMs }: { text: string; elapsedMs?: number }) {
  return (
    <div className="ai-reply-meta" data-testid="ai-reply-meta">
      {elapsedMs != null ? (
        <span className="ai-reply-meta-time">{tg('ai.workedFor', { s: String(Math.max(1, Math.round(elapsedMs / 1000))) })}</span>
      ) : null}
      {text.trim() ? (
        <button
          type="button"
          className="ai-meta-btn"
          data-testid="ai-reply-copy"
          title={tg('ux64.copy')}
          aria-label={tg('ux64.copy')}
          onClick={() => copyText(text)}
        >
          <Icon name="clipboard-list" size={14} />
        </button>
      ) : null}
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
  commandBar,
  skipCommand
}: {
  text: string
  badge?: boolean
  confirm?: boolean
  decision?: 'agreed' | 'skipped'
  canRun?: boolean
  onAgree?: (command: string) => void
  onDecline?: () => void
  commandBar?: (command: string) => ReactNode
  /** Command already shown in the card's own command block. */
  skipCommand?: string
}) {
  const fences = splitFences(text)
  if (fences.some((f) => f.kind === 'code')) {
    const firstText = fences.findIndex((f) => f.kind === 'text')
    return (
      <div className="ai-md-stack">
        {fences.map((f, i) =>
          f.kind === 'code' ? (
            coveredBy(skipCommand, f.code.split('\n')) ? null : <AiCodeBlock key={i} code={f.code} lang={f.lang} />
          ) : (
            <OpsReply
              key={i}
              text={f.text}
              badge={badge && i === firstText}
              confirm={confirm}
              decision={decision}
              canRun={canRun}
              onAgree={onAgree}
              onDecline={onDecline}
              commandBar={commandBar}
              skipCommand={skipCommand}
            />
          )
        )}
      </div>
    )
  }
  const layout: OpsLayout = layoutOpsReply(text)
  const firstCmd = layout.blocks.findIndex((b) => b.kind === 'commands')
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
        if (coveredBy(skipCommand, block.commands)) return null
        const bundle = commandBundle(block.commands)
        const showActions = confirm && block.confirm
        return (
          <div key={i} className="ai-reply-cmd" data-testid="ai-ops-commands">
            <div className="ai-cmd-head">
              <span className="ai-code-lang">shell</span>
              {badge && layout.risk && i === firstCmd ? <RiskBadge level={layout.risk} /> : null}
              <button
                type="button"
                className="ai-meta-btn ai-cmd-copy"
                title={tg('common.copy')}
                aria-label={tg('common.copy')}
                onClick={() => copyText(block.commands.join('\n'))}
              >
                <Icon name="clipboard-list" size={14} />
              </button>
            </div>
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
      if (l.exec) row.exec = l.exec
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
    if (m.exec) row.exec = m.exec
    out.push(row)
  }
  return out
}

export default function AIPanel({
  onAppAction,
  activeSessionId,
  historyKey = null,
  hostInventoryId = null,
  inventoryLookup = null,
  production = false,
  protection = 'normal',
  elevated = false,
  hostPolicy,
  onSetHostPolicy,
  tempPolicy,
  onSetTempPolicy,
  onOpenHostSafety,
  conversation = null,
  aiTargets = [],
  onSelectTarget,
  onReconnect,
  hostName = null,
  onOpenSettings,
  onNeedSession,
  onSwitchToConversation,
  initialPending = null,
  onPendingChange,
  focusPendingToken = 0,
  focusExecToken = 0,
  focusExec = null
}: Props) {
  const [lines, setLines] = useState<Line[]>([])
  /** D52: index into userPrompts(lines) while recalling, -1 otherwise */
  const recallRef = useRef(-1)
  const [input, setInput] = useState('')
  // D95: user starter prompts
  const [myPrompts, setMyPrompts] = useState<string[]>(() => loadPrompts())
  // D94: long pastes collapse into blocks sent after the typed question
  const [pasteBlocks, setPasteBlocks] = useState<PasteBlock[]>([])
  const [openBlock, setOpenBlock] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** 2.2/R16: planner run progress in the composer ("step n / limit"; streak only under auto). */
  const [runProgress, setRunProgress] = useState<{
    step: number
    max: number
    policy?: 'suggest' | 'ask' | 'auto'
    streak?: number
    streakCap?: number
    forced?: boolean
  } | null>(null)
  useEffect(() => {
    if (!busy) setRunProgress(null)
  }, [busy])
  const [includeTerminal, setIncludeTerminal] = useState(true)
  const [pendingConfirm, setPendingConfirm] = useState<{ requestId: string; action: AiAssistantReply['action'] } | null>(() =>
    initialPending
      ? { requestId: initialPending.requestId, action: initialPending.action as AiAssistantReply['action'] }
      : null
  )
  const [pendingPreviewHold, setPendingPreviewHold] = useState(() => initialPending?.preview?.trim() || '')

  const screenshotForceKeyRef = useRef(false)
  /** Round 14: screenshot-only protection override for prod banner (hooks on). */
  const [screenshotProtectionOverride, setScreenshotProtectionOverride] = useState<ProtectionLevel | null>(null)
  /** Round 18: screenshot-only audit→AI focus id (keeps is-audit-focus for harness). */
  const [screenshotAuditFocusId, setScreenshotAuditFocusId] = useState<string | null>(null)
  /** Round 14: keep D29 resume chip from being cleared by archive list effect. */
  const screenshotResumeLockRef = useRef(false)
  useEffect(() => {
    const onShot = (ev: Event) => {
      if (!screenshotHooksEnabled()) return
      const detail = (ev as CustomEvent<{ op?: string; preview?: string; requestId?: string; action?: string; empty?: boolean; partial?: string; title?: string; command?: string; description?: string; message?: string; errorCode?: string }>).detail
      if (
        detail?.op === 'aiStreaming' ||
        detail?.op === 'aiCancelled' ||
        detail?.op === 'aiEmptyResume' ||
        detail?.op === 'aiProdBanner' ||
        detail?.op === 'aiSuggestCard' ||
        detail?.op === 'aiError' ||
        detail?.op === 'aiAccentStack' ||
        detail?.op === 'aiAskProgress' ||
        detail?.op === 'aiBatchSticky' ||
        detail?.op === 'aiPlanStepAlign' ||
        detail?.op === 'aiExecAuditLink' ||
        detail?.op === 'aiAuditFocus' ||
        detail?.op === 'aiMemoryEvidence' ||
        detail?.op === 'aiFailureEvidence'
      ) {
        ;(window as unknown as { __aissShotAiOp?: typeof detail }).__aissShotAiOp = detail
      }
      const clearShotAiOp = () => {
        ;(window as unknown as { __aissShotAiOp?: unknown }).__aissShotAiOp = undefined
      }
      if (detail?.op === 'aiChat') {
        screenshotForceKeyRef.current = true
        setHasApiKey(true)
        setPendingConfirm(null)
        setLines(
          detail.empty
            ? []
            : SCREENSHOT_AI_CHAT_DEMO.map((d): UserLine | AssistantLine =>
                d.role === 'user'
                  ? { role: 'user', content: d.content }
                  : {
                      role: 'assistant',
                      content: d.content || d.command?.description || d.end?.description || '',
                      requestId: d.requestId,
                      elapsedMs: d.elapsedMs,
                      exec: d.exec,
                      fresh: false,
                      structured: d.command
                        ? { action: 'command', description: d.command.description, command: d.command.command, riskLevel: d.command.riskLevel }
                        : d.end
                          ? { action: 'end', description: d.end.description, riskLevel: d.end.riskLevel }
                          : undefined
                    }
              )
        )
        return
      }
      if (detail?.op === 'aiStreaming') {
        // H04/H05: real busy + streaming card (partial text + in-card Stop). No DOM inject.
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        const partial =
          typeof (detail as { partial?: string }).partial === 'string' && (detail as { partial?: string }).partial!.trim()
            ? (detail as { partial?: string }).partial!.trim()
            : '正在分析 nginx 502…\n先看 error.log 末尾：'
        setBusy(true)
        setLines([
          { role: 'user', content: 'nginx 502，帮我边生成边停一下看看' },
          { role: 'assistant', content: partial, streaming: true }
        ])
        return
      }
      if (detail?.op === 'aiCancelled') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        const partial =
          typeof (detail as { partial?: string }).partial === 'string' && (detail as { partial?: string }).partial!.trim()
            ? (detail as { partial?: string }).partial!.trim()
            : '正在分析 nginx 502…\n（已停止，可点重试继续）'
        setLines([
          { role: 'user', content: 'nginx 502，帮我边生成边停一下看看' },
          { role: 'assistant', content: partial, cancelled: true }
        ])
        return
      }
      if (detail?.op === 'aiEmptyResume') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = true
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setLines([])
        const title =
          typeof (detail as { title?: string }).title === 'string' && (detail as { title?: string }).title!.trim()
            ? (detail as { title?: string }).title!.trim()
            : 'nginx 502 排错'
        setResumeHit({
          id: 'shot-r14-resume',
          group: 'demo-host',
          hostLabel: '演示主机',
          key: 'demo-host',
          title,
          savedAt: Date.now() - 120000,
          count: 6
        })
        return
      }
      if (detail?.op === 'aiProdBanner') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride('production')
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'auto', safetyTier: 'confirm' }))
        setLines([
          { role: 'user', content: '生产机上帮我看一下磁盘' },
          {
            role: 'assistant',
            content: '这是生产主机：自动执行仍会跑低/中风险只读命令，高危必须确认。',
            fresh: false,
            structured: {
              action: 'end',
              description: '这是生产主机：自动执行仍会跑低/中风险只读命令，高危必须确认。',
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiSuggestCard') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'suggest', safetyTier: 'confirm' }))
        const cmd =
          typeof (detail as { command?: string }).command === 'string' && (detail as { command?: string }).command!.trim()
            ? (detail as { command?: string }).command!.trim()
            : 'systemctl status nginx --no-pager'
        const desc =
          typeof (detail as { description?: string }).description === 'string' &&
          (detail as { description?: string }).description!.trim()
            ? (detail as { description?: string }).description!.trim()
            : '查看 nginx 服务状态（只读）。'
        setLines([
          { role: 'user', content: '仅建议模式下，给我一条可复制的排查命令' },
          {
            role: 'assistant',
            content: desc,
            requestId: 'shot-r14-suggest',
            fresh: true,
            safetyMode: 'suggest',
            structured: { action: 'command', description: desc, command: cmd, riskLevel: 'low' }
          }
        ])
        return
      }
      if (detail?.op === 'aiError') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        const message =
          typeof (detail as { message?: string }).message === 'string' && (detail as { message?: string }).message!.trim()
            ? (detail as { message?: string }).message!.trim()
            : '模型请求失败：请检查 API Key 或网络后重试。'
        const errorCode =
          typeof (detail as { errorCode?: string }).errorCode === 'string'
            ? (detail as { errorCode?: string }).errorCode
            : 'http_401'
        setLines([
          { role: 'user', content: '帮我看看负载' },
          { role: 'assistant', content: message, variant: 'error', errorCode: errorCode || undefined }
        ])
        return
      }
      if (detail?.op === 'aiAccentStack') {
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(true)
        setLines([
          { role: 'user', content: '对比流式 / 取消 / 错误三种卡片左边条' },
          { role: 'assistant', content: '正在生成排查步骤…', streaming: true },
          { role: 'assistant', content: '已停止的半成品回复', cancelled: true },
          {
            role: 'assistant',
            content: '请求失败：上游超时。',
            variant: 'error',
            errorCode: 'http_504'
          }
        ])
        return
      }
      if (detail?.op === 'aiAskProgress') {
        // R17: ask policy + composer run-steps + active plan badge on pending card
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(true)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'ask', safetyTier: 'confirm' }))
        const step = typeof (detail as { step?: number }).step === 'number' ? (detail as { step?: number }).step! : 2
        const max = typeof (detail as { max?: number }).max === 'number' ? (detail as { max?: number }).max! : 10
        const preview =
          typeof (detail as { preview?: string }).preview === 'string' && (detail as { preview?: string }).preview!.trim()
            ? (detail as { preview?: string }).preview!.trim()
            : 'systemctl status nginx --no-pager'
        setRunProgress({ step, max, policy: 'ask' })
        setPendingConfirm({ requestId: 'shot-r17-ask', action: 'command' })
        setPendingPreviewHold(preview)
        setLines([
          { role: 'user', content: '生产机 nginx 502，按步骤确认执行' },
          {
            role: 'assistant',
            content: preview,
            requestId: 'shot-r17-ask',
            fresh: true,
            structured: {
              action: 'command',
              description: '查看 nginx 状态（当前规划步骤，需确认）。',
              command: preview,
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiBatchSticky') {
        // R17: >=2 suggestion commands → sticky batch bar near first suggestion
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setRunProgress(null)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'suggest', safetyTier: 'confirm' }))
        setLines([
          { role: 'user', content: '给我两步只读排查命令，方便批量填入' },
          {
            role: 'assistant',
            content: '查看磁盘占用。',
            fresh: true,
            safetyMode: 'suggest',
            structured: {
              action: 'command',
              description: '查看磁盘占用（只读）。',
              command: 'df -h',
              riskLevel: 'low'
            }
          },
          {
            role: 'assistant',
            content: '查看内存占用最高的进程。',
            fresh: true,
            safetyMode: 'suggest',
            structured: {
              action: 'command',
              description: '按内存占用列出前 10 个进程（只读）。',
              command: 'ps aux --sort=-%mem | head -n 11',
              riskLevel: 'low'
            }
          }
        ])
        return
      }

      if (detail?.op === 'aiPlanStepAlign') {
        // R18: agent loop says 7, but confirmable card is suggestion step 2 — chip/badge must show 2
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(true)
        setSafetySettings((prev) => ({ ...prev, aiPolicy: 'ask', safetyTier: 'confirm' }))
        const runStep = typeof (detail as { runStep?: number }).runStep === 'number' ? (detail as { runStep?: number }).runStep! : 7
        const max = typeof (detail as { max?: number }).max === 'number' ? (detail as { max?: number }).max! : 10
        setRunProgress({ step: runStep, max, policy: 'ask' })
        setPendingConfirm({ requestId: 'shot-r18-align', action: 'command' })
        setPendingPreviewHold('free -m')
        setLines([
          { role: 'user', content: '两步只读排查：磁盘与内存' },
          {
            role: 'assistant',
            content: 'df -h',
            decision: 'agreed',
            fresh: true,
            structured: {
              action: 'command',
              description: '查看磁盘占用（已确认执行）。',
              command: 'df -h',
              riskLevel: 'low'
            }
          },
          {
            role: 'assistant',
            content: 'free -m',
            requestId: 'shot-r18-align',
            fresh: true,
            structured: {
              action: 'command',
              description: '查看内存（当前规划步骤，需确认）。',
              command: 'free -m',
              riskLevel: 'low'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiExecAuditLink') {
        // R18: ExecReplay with jump-to-audit (AI → 审计)
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setRunProgress(null)
        setLines([
          { role: 'user', content: '看看内存最高的进程' },
          {
            role: 'assistant',
            content: 'ps aux --sort=-%mem | head -n 11',
            decision: 'agreed',
            fresh: true,
            structured: {
              action: 'command',
              description: '按内存占用列出前 10 个进程（只读）。',
              command: 'ps aux --sort=-%mem | head -n 11',
              riskLevel: 'low'
            },
            exec: {
              status: 'ok',
              exitCode: 0,
              at: Date.UTC(2026, 9, 20, 6, 12, 41),
              durationMs: 1240,
              outputLines: 11,
              auditId: 'aud-r18-link',
              summary: 'root 20517 2.1 7.5 containerd\napp 26383 1.4 4.8 java -jar app.jar'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiAuditFocus') {
        // R18: card highlighted as if jumped from audit row (审计 → 对话)
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setHasApiKey(true)
        setPendingConfirm(null)
        setBusy(false)
        setRunProgress(null)
        const auditId =
          typeof (detail as { auditId?: string }).auditId === 'string' && (detail as { auditId?: string }).auditId!.trim()
            ? (detail as { auditId?: string }).auditId!.trim()
            : 'aud-r18-focus'
        const cmd =
          typeof (detail as { command?: string }).command === 'string' && (detail as { command?: string }).command!.trim()
            ? (detail as { command?: string }).command!.trim()
            : 'ps aux --sort=-%mem | head -n 11'
        setScreenshotAuditFocusId(auditId)
        setLines([
          { role: 'user', content: '从审计跳回这一步' },
          {
            role: 'assistant',
            content: cmd,
            decision: 'agreed',
            fresh: true,
            structured: {
              action: 'command',
              description: '审计回跳高亮：对应已执行命令卡片。',
              command: cmd,
              riskLevel: 'low'
            },
            exec: {
              status: 'ok',
              exitCode: 0,
              at: Date.UTC(2026, 9, 20, 6, 12, 41),
              durationMs: 980,
              outputLines: 11,
              auditId,
              summary: 'root 20517 2.1 7.5 containerd'
            }
          }
        ])
        return
      }
      if (detail?.op === 'aiFailureEvidence') {
        // Round 21: pin failure evidence on a reply card (S27 visibility).
        // Round 22: do not call setTurnPending here — it is scoped to the stream handler below.
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(false)
        setPendingConfirm(null)
        setRunProgress(null)
        setMemoryOpen(false)
        const evidence =
          'command=echo S27_FAIL_CMD\nexit=1\nS27_STDERR_EVIDENCE\nS27_TIMEOUT_STUB'
        setLines([
          { role: 'user', content: '请执行 echo S27_FAIL_CMD。确认后再发。' },
          {
            role: 'assistant',
            content: '提议执行 echo S27_FAIL_CMD，等待确认。',
            structured: {
              description: '提议执行 echo S27_FAIL_CMD，等待确认。',
              action: 'command',
              command: 'echo S27_FAIL_CMD',
              riskLevel: 'low',
              completed: false
            },
            requestId: 'shot-r21-fail',
            decision: 'agreed',
            fresh: false,
            exec: {
              status: 'failed',
              at: Date.now() - 1200,
              durationMs: 420,
              exitCode: 1,
              summary: 'S27_STDERR_EVIDENCE',
              outputLines: 1,
              failureKind: 'nonzero',
              evidence,
              retryBudget: { count: 1, cap: 2, exhausted: false }
            }
          }
        ])
        const nextCmd =
          typeof (detail as { nextConfirm?: string }).nextConfirm === 'string'
            ? (detail as { nextConfirm?: string }).nextConfirm!.trim()
            : ''
        if (nextCmd) {
          // Round 22: failure pin + next confirm dock (plan-step link visual).
          setRunProgress({ step: 2, max: 3, policy: 'ask' })
          setPendingConfirm({ requestId: 'shot-r22-next', action: 'command' })
          setPendingPreviewHold(nextCmd)
          setLines((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `下一步建议：${nextCmd}`,
              structured: {
                description: `下一步建议：${nextCmd}`,
                action: 'command',
                command: nextCmd,
                riskLevel: 'medium',
                completed: false
              },
              requestId: 'shot-r22-next',
              fresh: true
            }
          ])
        }
        return
      }
      if (detail?.op === 'aiMemoryEvidence') {
        screenshotForceKeyRef.current = true
        setHasApiKey(true)
        const d = detail as {
          goal?: string
          hostFacts?: string[]
          observations?: string[]
          recentCommands?: string[]
        }
        const view = buildMemoryEvidenceView({
          goal: d.goal ?? '排查 nginx 502',
          hostFacts: d.hostFacts ?? ['web-01 / 10.0.0.8'],
          observations: d.observations ?? ['df：/ 使用 91%', 'nginx inactive (dead)'],
          recentCommands: d.recentCommands ?? ['systemctl status nginx --no-pager']
        })
        setWorkingGoal(view.goal)
        setMemoryView(view)
        setMemoryOpen(true)
        return
      }
      if (detail?.op !== 'aiComposerPop') {
        ;(window as unknown as { __aissShotPop?: string }).__aissShotPop = undefined
        setModelOpen(false)
        setSafetyOpen(false)
      }
      if (detail?.op === 'aiComposerPop') {
        const which = (detail as { which?: string }).which === 'model' ? 'model' : 'safety'
        // The panel may remount while the demo session binds; remember the request for the next mount.
        ;(window as unknown as { __aissShotPop?: string }).__aissShotPop = which
        setModelOpen(which === 'model')
        setSafetyOpen(which === 'safety')
        return
      }
      if (detail && detail.op === 'aiAction') {
        // c53 screenshot: a demo reply carrying an app action card
        screenshotForceKeyRef.current = true
        setHasApiKey(true)
        const name = String((detail as { name?: string }).name || 'connection.add')
        const params = ((detail as { params?: Record<string, string> }).params) || {}
        setLines((prev) => [...prev, { role: 'user', content: String((detail as { ask?: string }).ask || name) }, { role: 'assistant', content: '', fresh: true, structured: { action: 'end', completed: true, description: String((detail as { say?: string }).say || name), riskLevel: 'low', appAction: { name, params } } }])
        return
      }
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
    if (screenshotHooksEnabled()) {
      const pending = (window as unknown as { __aissShotPop?: string }).__aissShotPop
      setModelOpen(pending === 'model')
      setSafetyOpen(pending === 'safety')
      const pendingAi = (window as unknown as { __aissShotAiOp?: { op?: string } }).__aissShotAiOp
      if (pendingAi?.op) {
        // R14: panel may mount after the op event; replay once.
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent(SCREENSHOT_EVENT, { detail: pendingAi }))
        }, 50)
      }
    }
    return () => window.removeEventListener(SCREENSHOT_EVENT, onShot)
  }, [])
  // 2.4: the production banner's "AI 自动执行" chip opens the composer policy menu
  useEffect(() => {
    const onOpenPolicy = () => {
      setModelOpen(false)
      setSafetyOpen(true)
    }
    window.addEventListener(OPEN_AI_POLICY_EVENT, onOpenPolicy)
    return () => window.removeEventListener(OPEN_AI_POLICY_EVENT, onOpenPolicy)
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
  /** Round 23: one-shot — scroll to confirm after 带证据重试. */
  const scrollConfirmAfterEvidenceRetryRef = useRef(false)
  const pendingNeedSessionRef = useRef<HTMLButtonElement>(null)
  const pendingDeclineRef = useRef<HTMLButtonElement>(null)
  const [inputMenu, setInputMenu] = useState<{ x: number; y: number } | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [safetyOpen, setSafetyOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const modelRef = useRef<HTMLDivElement | null>(null)
  const safetyRef = useRef<HTMLDivElement | null>(null)
  const [workingGoal, setWorkingGoal] = useState<string | null>(null)
  const [memoryView, setMemoryView] = useState<MemoryEvidenceView | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const memoryRef = useRef<HTMLDivElement | null>(null)
  const [safetySettings, setSafetySettings] = useState<SafetySettings>({ safetyTier: 'confirm' })
  const seenConfirm = useRef(new Set<string>())
  const moreRef = useRef<HTMLDivElement>(null)
  const inputMenuRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines
  const persistKey = resolveHistoryKey(historyKey, activeSessionId)
  aiPanelSession.current = activeSessionId
  // M23: the bound tab's state. Offline tabs keep their history but cannot continue.
  const convStatus: 'connected' | 'connecting' | 'disconnected' | 'none' = conversation ? conversation.status : 'none'
  const convOffline = convStatus === 'disconnected' || convStatus === 'connecting'
  const persistKeyRef = useRef(persistKey)
  persistKeyRef.current = persistKey
  /**
   * M20: the in-flight turn is bound to the conversation it started in. Stream events for it
   * update that conversation only; if the user switched tabs mid-reply they are kept (and
   * persisted) off-screen instead of landing in the conversation now on screen.
   */
  const turnRef = useRef<{
    key: string | null
    host: string
    lines: Line[]
    pending: { requestId: string; action: AiAssistantReply['action'] } | null
    stopped: boolean
  } | null>(null)
  const [turnElsewhere, setTurnElsewhere] = useState<{ key: string | null; host: string } | null>(null)

  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? providers[0]
  const modelList = activeProvider?.modelList ?? []

  useEffect(() => {
    const refresh = () => {
      void window.aiss.ai.getSettings().then((s) => {
        const providers = Array.isArray(s?.providers) ? s.providers : []
        const p = providers.find((x) => x.id === s?.activeProviderId) ?? providers[0]
        setProviders(providers)
        setActiveProviderId(s?.activeProviderId || providers[0]?.id || '')
        setActiveModel(s?.model || '')
        setSafetySettings(s)
        const ready = (p ? hasUsableKey(p.baseURL, p.apiKey) : false) || screenshotForceKeyRef.current
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
      setMemoryView(null)
      setMemoryOpen(false)
      return
    }
    const snapFn = window.aiss?.ai?.getMemorySnapshot
    const goalFn = window.aiss?.ai?.getWorkingMemory
    const applyView = (raw: {
      goal?: string | null
      hostFacts?: string[]
      observations?: string[]
      recentCommands?: string[]
    } | null) => {
      if (persistKeyRef.current !== key) return
      const view = buildMemoryEvidenceView(raw ?? {})
      setWorkingGoal(view.goal)
      setMemoryView(view.count > 0 ? view : view.goal ? view : null)
      if (!(view.count > 0)) setMemoryOpen(false)
    }
    if (typeof snapFn === 'function') {
      void Promise.resolve(snapFn(key))
        .then((snap) => applyView(snap))
        .catch(() => {
          if (typeof goalFn === 'function') {
            void Promise.resolve(goalFn(key))
              .then((goal) => applyView({ goal }))
              .catch(() => {
                if (persistKeyRef.current === key) {
                  setWorkingGoal(null)
                  setMemoryView(null)
                }
              })
          } else if (persistKeyRef.current === key) {
            setWorkingGoal(null)
            setMemoryView(null)
          }
        })
      return
    }
    if (typeof goalFn !== 'function') {
      setWorkingGoal(null)
      setMemoryView(null)
      return
    }
    void Promise.resolve(goalFn(key))
      .then((goal) => applyView({ goal }))
      .catch(() => {
        if (persistKeyRef.current === key) {
          setWorkingGoal(null)
          setMemoryView(null)
        }
      })
  }, [])

  // Load persisted chat when history key / session changes
  useEffect(() => {
    let cancelled = false
    // Keep screenshot/demo pending dock across history reloads.
    if (!screenshotForceKeyRef.current) setPendingConfirm(null)
    const turn = turnRef.current
    if (turn && turn.key !== persistKey) {
      // Left the conversation mid-reply: keep what it has so far under its own key.
      if (turn.key) void window.aiss.ai.setChatHistory(turn.key, linesToHistoryMessages(turn.lines))
      setTurnElsewhere({ key: turn.key, host: turn.host })
    } else {
      setTurnElsewhere(null)
    }
    if (turn && turn.key === persistKey) {
      setLines(turn.lines.slice())
      if (turn.pending) setPendingConfirm(turn.pending)
      return
    }
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

  useEffect(() => {
    if (!memoryOpen) return
    const close = (e: MouseEvent) => {
      if (memoryRef.current?.contains(e.target as Node)) return
      setMemoryOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMemoryOpen(false)
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', esc, true)
    }
  }, [memoryOpen])

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
  // Round 23: after 「带证据重试」, force-scroll + highlight the new confirm (wins over tail scroll).
  useEffect(() => {
    if (!pendingConfirm?.requestId) return
    const id = pendingConfirm.requestId
    const fromEvidenceRetry = scrollConfirmAfterEvidenceRetryRef.current
    if (fromEvidenceRetry) {
      scrollConfirmAfterEvidenceRetryRef.current = false
      const run = () => focusAiPendingAfterFailure(id)
      requestAnimationFrame(() => requestAnimationFrame(run))
      const t = window.setTimeout(run, 180)
      return () => window.clearTimeout(t)
    }
    const el = document.querySelector(`[data-confirm-id="${id}"]`)
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
      const turn = {
        key: persistKey,
        host: conversation ? conversationLabel(conversation.hostLabel, conversation.n) : hostName || inventoryLookup?.host || '',
        lines: [...linesRef.current, userLine],
        pending: null as { requestId: string; action: AiAssistantReply['action'] } | null,
        stopped: false
      }
      turnRef.current = turn
      setTurnElsewhere(null)
      const onScreen = () => persistKeyRef.current === turn.key
      /** Apply an update to this turn's conversation, on screen or off. */
      const applyTurn = (fn: (prev: Line[]) => Line[]) => {
        // H04: Stop marks the turn stopped — ignore late deltas entirely.
        if (turn.stopped) return
        // H04/H05: once a newer turn owns turnRef, do not paint into the live transcript.
        const live = turnRef.current === turn
        if (live && onScreen()) {
          setLines((prev) => {
            const next = fn(prev)
            turn.lines = next
            return next
          })
          return
        }
        turn.lines = fn(turn.lines)
        if (turn.key) void window.aiss.ai.setChatHistory(turn.key, linesToHistoryMessages(turn.lines))
      }
      const persistTurn = (next: Line[]) => {
        if (turn.key) void window.aiss.ai.setChatHistory(turn.key, linesToHistoryMessages(next))
      }
      const setTurnPending = (p: { requestId: string; action: AiAssistantReply['action'] } | null) => {
        turn.pending = p
        if (onScreen()) setPendingConfirm(p)
      }
      setLines(turn.lines)
      setBusy(true)
      setPendingConfirm(null)

      // H06: always read live transcript from linesRef (post new-chat / restore), not a stale closure.
      const history: AiChatMessage[] = [
        ...linesRef.current.map<AiChatMessage>((l) => ({
          role: l.role,
          content: l.content
        })),
        { role: 'user', content: text }
      ]

      const debugTurnId = crypto.randomUUID()
      const turnStarted = Date.now()

      let usedStepProtocol = false
      let assistant = ''
      // 2.3: audit id per command, attached to the replay record when the exec event arrives
      const auditIds = new Map<string, string>()
      const unsub = window.aiss.ai.onStream((ev) => {
      if (ev.type === 'exec') {
        const rec: ExecRecord = { ...ev.payload, ...(auditIds.get(ev.command) ? { auditId: auditIds.get(ev.command) } : {}) }
        applyTurn((prev) => {
          const next = [...prev]
          for (let k = next.length - 1; k >= 0; k--) {
            const l = next[k]
            if (l.role !== 'assistant' || !l.structured) continue
            const sameReq = Boolean(ev.requestId && l.requestId === ev.requestId)
            const sameCmd = (l.structured.command ?? '').replace(/[\r\n]+/g, ' ').trim() === ev.command
            if ((sameReq || sameCmd) && !l.exec) {
              next[k] = { ...l, exec: rec }
              queueMicrotask(() => persistTurn(next))
              break
            }
          }
          return next
        })
        return
      }
      if (ev.type === 'audit') {
        // 2.1: one row per AI command, with tab #n and the resolved policy.
        const a = ev.payload
        const auditRow = appendAudit({
          type: 'command',
          host: turn.host || '—',
          source: 'AI',
          outcome: a.outcome,
          detail: a.reason === 'readonly' ? `${a.command} · ${tg('ai.auditReadonly')}` : a.command,
          protection: a.protection,
          tabNo: conversation?.n,
          policyChosen: a.policyChosen,
          policyEffective: a.policyEffective,
          policySource: a.policySource,
          policyCappedBy: a.policyCappedBy
        })
        if (auditRow) auditIds.set(a.command, auditRow.id)
        window.dispatchEvent(new Event('aiss-audit-changed'))
        return
      }
      if (ev.type === 'progress') {
        // R16: ask/suggest/auto all show plan step n/max; streak chip stays auto-only in the UI.
        setRunProgress({
          step: ev.step,
          max: ev.maxSteps,
          policy: ev.policy,
          streak: ev.autoStreak,
          streakCap: ev.autoStreakCap,
          forced: ev.forcedConfirm === true
        })
        return
      }
      if (ev.type === 'status') {
        applyTurn((prev) => {
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
        applyTurn((prev) => {
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
          queueMicrotask(() => persistTurn(next))
          return next
        })
        setTurnPending(ev.requestId ? { requestId: ev.requestId, action: s.action } : null)
        return
      }
      if (ev.type === 'delta') {
        if (usedStepProtocol) return
        assistant += ev.text
        // H04: paint partial text into the live streaming card (not a blank "Generating…" shell).
        applyTurn((prev) => applyStreamDelta(prev, ev.text))
        return
      }
      if (ev.type === 'cancelled') {
        setTurnPending(null)
        applyTurn((prev) => {
          const next = [...prev]
          const msg = ev.message?.trim() ? ev.message.trim() : tg('ai.cancelled')
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            next[next.length - 1] = { role: 'assistant', content: msg, streaming: false }
            return next
          }
          for (let i = next.length - 1; i >= 0; i--) {
            const row = next[i]
            if (row.role === 'assistant' && row.streaming) {
              next[i] = { role: 'assistant', content: msg, streaming: false }
              return next
            }
          }
          if (last?.role === 'assistant' && last.content === msg) return next
          next.push({ role: 'assistant', content: msg })
          return next
        })
        // H05: free the composer immediately; do not wait for chat() finally.
        if (turnRef.current === turn) {
          setBusy(false)
          setRunProgress(null)
          queueMicrotask(() => inputRef.current?.focus())
        }
        return
      }
      if (ev.type === 'error') {
        setTurnPending(null)
        applyTurn((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          const raw = String(ev.message ?? '')
          const fe = friendlyError(raw)
          const row: AssistantLine = {
            role: 'assistant',
            content: fe.message || tg('pf5.aiFail'),
            detail: fe.detail && fe.detail !== fe.message ? fe.detail : undefined,
            variant: 'error',
            errorCode: fe.code
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
          protection,
          elevated,
          ...(hostPolicy ? { hostPolicy } : {}),
          ...(tempPolicy ? { tempPolicy } : {}),
          hostId: inventoryLookup?.profileId || hostInventoryId || undefined,
          hostName: hostName || inventoryLookup?.host,
          sessionId: persistKey || undefined
        }
      })
      if (!usedStepProtocol) {
        const raw = assistant.trim()
        const parsed = parseAiAssistantReply(raw)
        applyTurn((prev) => {
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
      const elapsedMs = Date.now() - turnStarted
      applyTurn((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role !== 'assistant' || last.streaming || last.elapsedMs != null) return prev
        const next = [...prev]
        next[next.length - 1] = { ...last, elapsedMs }
        return next
      })
      // H05: only clear busy for this turn — a quick retry after Stop must keep its busy flag.
      if (turnRef.current === turn) {
        setBusy(false)
        setRunProgress(null)
        setTurnPending(null)
        turnRef.current = null
      }
      refreshWorkingGoal(persistKey)
      // Persist user + assistant text after the turn completes — under the turn's own key.
      voidMicrotask(() => {
        persistTurn(turn.lines)
        if (turnRef.current === turn) turnRef.current = null
        setTurnElsewhere(null)
      })
    }
  },
    [activeSessionId, hostInventoryId, hostName, inventoryLookup, persistHistory, persistKey, production, refreshWorkingGoal]
  )

  const send = useCallback(async () => {
    const text = composeWithBlocks(input, pasteBlocks)
    if (!text || busy) return
    if (convOffline) {
      showToast(tg('ai.reconnectToContinue'), { kind: 'error' })
      return
    }

    let terminalExcerpt: string | undefined
    if (includeTerminal && activeSessionId) {
      const snap = await fetchTerminalSnapshot('fromCommand')
      if (snap) terminalExcerpt = snap
    }

    setInput('')
    setPasteBlocks([])
    setOpenBlock(null)
    await submitToAi(text, terminalExcerpt)
  }, [busy, convOffline, fetchTerminalSnapshot, includeTerminal, activeSessionId, input, pasteBlocks, submitToAi])

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
      // M20: a read-only host never takes an AI write, even after Agree.
      if (aiEffectiveLevel({ level: protection, elevated }) === 'readonly') {
        showToast(tg('ai.readonlyBlocked'), { kind: 'error' })
        return
      }
      dispatchInjectTerminal(activeSessionId, oneLine, true)
    },
    [activeSessionId, protection, elevated]
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
      const step = window.aiss?.ai?.confirmStep ?? window.aiss?.ai?.resolveConfirm
    if (typeof step !== 'function') return
    await step(requestId, ok)
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

  // Round 17: focus card matching audit id / command after jump-from-audit
  useEffect(() => {
    if (!focusExecToken) return
    const id = focusExec?.id?.trim() || ''
    const cmd = focusExec?.text?.trim() || ''
    const root = document.querySelector('.ai-panel') || document
    let el: Element | null = null
    if (id) el = root.querySelector(`[data-exec-audit-id="${CSS.escape(id)}"]`)
    if (!el && cmd) {
      const cards = Array.from(root.querySelectorAll('[data-testid="ai-reply-card"][data-exec-command]'))
      el =
        cards.find((c) => (c.getAttribute('data-exec-command') || '') === cmd) ||
        cards.find((c) => {
          const v = c.getAttribute('data-exec-command') || ''
          return v && (cmd.includes(v) || v.includes(cmd.split(' ')[0] || ''))
        }) ||
        null
    }
    if (!el && cmd) {
      // Fallback: any exec replay whose sibling command text matches
      el =
        Array.from(root.querySelectorAll('[data-testid="ai-exec-replay"]')).find((node) => {
          const card = node.closest('[data-testid="ai-reply-card"]')
          const attr = card?.getAttribute('data-exec-command') || ''
          return attr && (attr === cmd || cmd.includes(attr) || attr.includes(cmd))
        }) || null
    }
    root.querySelectorAll('.is-audit-focus').forEach((n) => n.classList.remove('is-audit-focus'))
    if (!el) {
      // Round 22: calm info toast + scroll-to-top action (R17 weak-toast debt).
      const miss = buildAuditOpenAiMissToast()
      showToast(tg(miss.messageKey), {
        kind: miss.kind,
        theme: miss.theme,
        ms: miss.ms,
        action: {
          label: tg(miss.actionKey),
          run: () => {
            const list = document.querySelector<HTMLElement>('.ai-panel .ai-messages, .ai-panel [data-testid="ai-messages"]')
            if (list) list.scrollTo({ top: 0, behavior: 'smooth' })
            else {
              const root = document.querySelector('.ai-panel') as HTMLElement | null
              root?.scrollTo?.({ top: 0, behavior: 'smooth' })
            }
          }
        }
      })
      return
    }
    const card = el.closest('[data-testid="ai-reply-card"]') || el
    card.classList.add('is-audit-focus')
    card.setAttribute('data-audit-focus', '1')
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const toggle = card.querySelector<HTMLButtonElement>('[data-testid="ai-exec-toggle"]')
    if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click()
    const tmr = window.setTimeout(() => {
      card.classList.remove('is-audit-focus')
      card.removeAttribute('data-audit-focus')
    }, 4200)
    return () => window.clearTimeout(tmr)
  }, [focusExecToken, focusExec?.id, focusExec?.text])


  const markDecision = useCallback((index: number, decision: 'agreed' | 'skipped') => {
    setLines((prev) => {
      const next = prev.map((row, idx) => (idx === index && row.role === 'assistant' ? { ...row, decision } : row))
      queueMicrotask(() => persistHistory(next))
      return next
    })
  }, [persistHistory])

  /**
   * Round 21 / S27: pin-card CTA — new ask citing evidence; never silent SSH write / confirmStep.
   * Exhausted budget still opens a composer ask so the user can change approach.
   */
  const retryWithFailureEvidence = useCallback(
    (input: { command: string; evidence: string; exhausted: boolean }) => {
      if (busy) {
        showToast(tg('ai.busyWait'), { kind: 'error' })
        return
      }
      const evidence = (input.evidence || '').trim()
      const cmd = (input.command || '').trim()
      if (!evidence) {
        showToast(tg('fail.noEvidence'), { kind: 'error' })
        return
      }
      if (input.exhausted) {
        const draft = tg('fail.exhaustedAsk', { evidence })
        setInput(draft)
        showToast(tg('fail.budgetExhausted'), { kind: 'error' })
        queueMicrotask(() => {
          const el = inputRef.current
          if (!el) return
          el.focus()
          el.setSelectionRange(0, el.value.length)
        })
        return
      }
      const ask = tg('fail.retryAsk', { evidence, command: cmd || '—' })
      scrollConfirmAfterEvidenceRetryRef.current = true
      void submitToAi(ask)
    },
    [busy, submitToAi]
  )

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

  // D6: selection → composer (context block, caret at the end for the follow-up question; never auto-sends)
  useEffect(() => {
    const take = () => {
      const t = takeAiPrefill()
      if (!t) return
      setInput((v) => (v.trim() ? `${v.replace(/\s+$/, '')}\n\n${t}` : t))
      window.setTimeout(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
        el.scrollTop = el.scrollHeight
      }, 0)
    }
    take()
    window.addEventListener(AI_PREFILL_EVENT, take)
    return () => window.removeEventListener(AI_PREFILL_EVENT, take)
  }, [])

  const stopGeneration = useCallback(() => {
    void window.aiss.ai.abortChat()
    // H04: invalidate live turn on Stop so late deltas cannot reopen streaming.
    const cur = turnRef.current
    if (cur) {
      cur.stopped = true
      turnRef.current = null
    }
    // H05: unlock composer right away; finalize the card text locally.
    setBusy(false)
    setRunProgress(null)
    setPendingConfirm(null)
    setLines((prev) => {
      const next = finalizeStoppedLines(prev, tg('ai.cancelled'), { ensureCancelledRow: true }) as typeof prev
      if (cur) cur.lines = next
      return next
    })
    queueMicrotask(() => inputRef.current?.focus())
  }, [])
  // 2.2: Ctrl+Shift+Backspace (⌘⇧⌫ on macOS) stops the run from anywhere while the AI is working.
  useEffect(() => {
    if (!busy) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' || !e.shiftKey || !(e.ctrlKey || e.metaKey) || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      stopGeneration()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [busy, stopGeneration])

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
      setMemoryView(null)
      setMemoryOpen(false)
      if (persistKey) {
        await window.aiss.ai.setChatHistory(persistKey, [])
        refreshWorkingGoal(persistKey)
      }
    })()
  }, [busy, persistKey, refreshWorkingGoal])

  /** M23: 新对话 archives the current conversation (restorable from History) instead of deleting it. */
  const archiveCurrent = useCallback(async (): Promise<boolean> => {
    const msgs = linesToHistoryMessages(linesRef.current)
    if (!msgs.length || !persistKey || !window.aiss.ai.chatArchive) return false
    await window.aiss.ai.chatArchive.add({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      group: conversation?.group ?? GENERAL_CONVERSATION_KEY,
      hostLabel: conversation ? conversation.hostLabel : tg('ai.generalChat'),
      key: persistKey,
      title: archiveTitle(msgs) || tg('ai.untitledChat'),
      savedAt: Date.now(),
      messages: msgs
    })
    return true
  }, [conversation, persistKey])

  const startNewChat = useCallback(() => {
    if (busy) {
      showToast(tg('ai.clearBusy'), { kind: 'error' })
      return
    }
    if (!linesRef.current.length) {
      showToast(tg('ai.chatAlreadyEmpty'))
      return
    }
    void (async () => {
      const archived = await archiveCurrent()
      setLines([])
      setPendingConfirm(null)
      setWorkingGoal(null)
      setMemoryView(null)
      setMemoryOpen(false)
      if (persistKey) {
        await window.aiss.ai.setChatHistory(persistKey, [])
        refreshWorkingGoal(persistKey)
      }
      showToast(tg(archived ? 'ai.archivedChat' : 'ai.newChatStarted'))
    })()
  }, [archiveCurrent, busy, persistKey, refreshWorkingGoal])

  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement | null>(null)
  const [archives, setArchives] = useState<AiArchiveSummary[]>([])
  useEffect(() => {
    if (!historyOpen) return
    void window.aiss.ai.chatArchive?.list().then(setArchives, () => setArchives([]))
    const onDown = (e: MouseEvent) => {
      if (historyRef.current?.contains(e.target as Node)) return
      setHistoryOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [historyOpen])

  // D29: empty conversation on a host that had one recently -> offer to continue it
  const [resumeHit, setResumeHit] = useState<AiArchiveSummary | null>(null)
  const resumeGroup = conversation?.group ?? null
  useEffect(() => {
    if (screenshotResumeLockRef.current) return
    setResumeHit(null)
    if (!resumeGroup || lines.length > 0 || !window.aiss.ai.chatArchive) return
    let cancelled = false
    void window.aiss.ai.chatArchive.list().then(
      (rows) => {
        if (!cancelled) setResumeHit(resumeCandidate(rows, resumeGroup, Date.now()))
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [resumeGroup, persistKey, lines.length === 0])

  const restoreArchived = (id: string) => {
    if (busy || !persistKey || !window.aiss.ai.chatArchive) return
    setHistoryOpen(false)
    void (async () => {
      await archiveCurrent()
      const msgs = await window.aiss.ai.chatArchive!.take(id)
      setPendingConfirm(null)
      setLines(historyToLines(msgs))
      await window.aiss.ai.setChatHistory(persistKey, msgs)
      refreshWorkingGoal(persistKey)
    })()
  }

  const deleteArchived = (id: string) => {
    if (busy || !window.aiss.ai.chatArchive?.remove) return
    void (async () => {
      const ok = await confirmDialog({
        title: tg('ai.deleteHistoryTitle'),
        body: tg('ai.deleteHistoryBody'),
        confirmText: tg('ai.deleteHistory'),
        danger: true
      })
      if (!ok) return
      const removed = await window.aiss.ai.chatArchive!.remove!(id)
      if (!removed) return
      setArchives((prev) => prev.filter((a) => a.id !== id))
      setResumeHit((prev) => (prev?.id === id ? null : prev))
      showToast(tg('ai.historyDeleted'))
    })()
  }

  const [targetOpen, setTargetOpen] = useState(false)
  const targetRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!targetOpen) return
    const onDown = (e: MouseEvent) => {
      if (targetRef.current?.contains(e.target as Node)) return
      setTargetOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTargetOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [targetOpen])

  /** M23: moving to another tab moves the AI to that host — confirm first. */
  const pickTarget = (t: { tabId: string; label: string; active: boolean }) => {
    setTargetOpen(false)
    if (t.active || !onSelectTarget) return
    void (async () => {
      const ok = await confirmDialog({
        title: tg('ai.targetConfirmTitle', { host: t.label }),
        body: tg('ai.targetConfirmBody', { host: t.label }),
        confirmText: tg('ai.targetConfirm')
      })
      if (ok) onSelectTarget(t.tabId)
    })()
  }

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
    // D89: Esc closes; focus the first item so arrows work like other menus
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false)
        moreRef.current?.querySelector<HTMLButtonElement>('[data-testid="ai-more"]')?.focus()
      }
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', onKey)
    window.setTimeout(() => moreRef.current?.querySelector<HTMLButtonElement>('.ai-more-menu button:not(:disabled)')?.focus(), 0)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  useEffect(() => {
    if (!modelOpen) return
    const close = (e: MouseEvent) => {
      if (modelRef.current?.contains(e.target as Node)) return
      setModelOpen(false)
    }
    window.addEventListener('mousedown', close, true)
    const t = window.setTimeout(() => {
      const root = modelRef.current
      const el = root?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ?? root?.querySelector<HTMLElement>('[role="menuitemradio"]')
      el?.focus()
    }, 0)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.clearTimeout(t)
    }
  }, [modelOpen])

  useEffect(() => {
    if (!safetyOpen) return
    const close = (e: MouseEvent) => {
      if (safetyRef.current?.contains(e.target as Node)) return
      setSafetyOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSafetyOpen(false)
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', esc, true)
    // R19: keyboard/touch — focus current policy option (no hover required to know where you are).
    const t = window.setTimeout(() => {
      const root = safetyRef.current
      if (!root) return
      const current =
        root.querySelector<HTMLElement>('[data-testid="ai-safety-option"].is-current') ||
        root.querySelector<HTMLElement>('[data-testid="ai-safety-option"]:not(.is-disabled)')
      current?.focus()
    }, 0)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', esc, true)
      window.clearTimeout(t)
    }
  }, [safetyOpen])

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
  }) =>
    // M23: general Q&A (no terminal bound) never offers Run / Agree.
    !conversation ? (
      <div className="ai-decision" data-testid="ai-no-execute">
        {tg('ai.generalNoRun')}
      </div>
    ) : (
    <SafetyCommandBar
      {...opts}
      canRun={Boolean(activeSessionId)}
      sessionKey={persistKey}
      hostId={inventoryLookup?.profileId || hostInventoryId}
      hostName={hostName || inventoryLookup?.host}
      production={production}
      hostPolicy={hostPolicy}
      tempPolicy={tempPolicy}
      protection={{ level: protection, elevated }}
      settings={safetySettings}
      onCopy={(cmd) => copyText(cmd)}
      onFill={
        activeSessionId
          ? (cmd) => {
              aiOrigins.mark(activeSessionId, cmd)
              fillCommandBar(activeSessionId, cmd)
              showToast(tg('d15.filled'))
            }
          : undefined
      }
    />
  )

  // R15/R16: multi-step plan — batch-copy + 逐条填入; sticky bar anchors at first suggestion.
  const suggestionCommands = useMemo(() => collectSuggestionCommands(lines), [lines])
  const batchCopyText = useMemo(() => formatSuggestionCommandsForCopy(suggestionCommands), [suggestionCommands])
  const firstSuggestionIdx = useMemo(() => {
    for (let idx = 0; idx < lines.length; idx++) {
      const row = lines[idx]
      if (row.role !== 'assistant' || !row.structured) continue
      if (row.structured.action !== 'command') continue
      if (row.structured.command?.trim()) return idx
    }
    return -1
  }, [lines])

  // H07/R18: number consecutive command/tool suggestion cards; chip+badge share this map.
  const suggestionStepNo = useMemo(() => buildSuggestionStepNos(lines), [lines])
  const alignedPlan = useMemo(() => {
    const confirmIdx = findConfirmableLineIndex(lines, pendingConfirm?.requestId)
    const sugStep = confirmIdx >= 0 ? suggestionStepNo.get(confirmIdx) : undefined
    return alignPlanStepDisplay({
      runStep: runProgress?.step,
      runMax: runProgress?.max,
      suggestionStep: sugStep,
      suggestionCount: suggestionStepNo.size
    })
  }, [lines, pendingConfirm?.requestId, suggestionStepNo, runProgress])

  // M21: the chip shows the policy that actually applies (global / host, capped by protection).
  const aiPolicy = resolveAiPolicy({
    settings: safetySettings,
    hostPolicy,
    tempOverride: tempPolicy,
    protection:
      screenshotProtectionOverride || activeSessionId
        ? { level: (screenshotProtectionOverride ?? protection) as ProtectionLevel, elevated: screenshotProtectionOverride ? false : elevated }
        : null
  })
  const policyCap = aiPolicy.cappedBy ? policyCapNote(aiPolicy.cappedBy) : ''
  const policyChipTitle = `${tg('policy.effective', { policy: tg(`policy.${aiPolicy.effective}` as 'policy.ask') })}${policyCap} · ${tg(`policy.source.${aiPolicy.source}` as 'policy.source.global')}`
  const ladderBand = safetyLadderBand(policyTier(aiPolicy.effective))
  // 2.4: match terminal banner — raw protection level + elevate pause, not the
  // flattened `production` prop (which already drops elevated sessions).
  const protectionForUi = screenshotProtectionOverride ?? protection
  const panelProdAuto = prodAutoHint({
    level: protectionForUi === 'production' ? 'production' : protectionForUi === 'readonly' ? 'readonly' : 'normal',
    paused: Boolean(elevated && protectionForUi === 'production'),
    policy: aiPolicy
  })
  const currentModel = modelList.includes(activeModel) ? activeModel : modelList[0] ?? ''
  /** M25: the policy without the tab override; picking it clears the override. */
  const hostOrGlobalPolicy = resolveAiPolicy({ settings: safetySettings, hostPolicy, protection: null }).chosen
  /** M25: why an option cannot apply on this host (protection cap), or '' when it can. */
  const policyOptionCap = (id: AiPolicy): string => {
    if (!activeSessionId) return ''
    const r = resolveAiPolicy({ settings: safetySettings, hostPolicy, tempOverride: id, protection: { level: protection, elevated } })
    if (r.effective === id) return ''
    const max = tg(`policy.${r.effective}` as 'policy.ask')
    return tg('policy.capMaxReadonly', { policy: max })
  }

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
      {aiEmptyGate(hasApiKey) === 'needs_config' ? (
        <div className="ai-empty-state" data-testid="ai-empty-state">
          <div className="ai-config-head">{tg('ai.title')}</div>
          <AiConfigCard context={configContext} flash={configFlash} onConfigure={() => onOpenSettings?.()} />
        </div>
      ) : (
        <>
      <div className="ai-header">
        <div className="ai-header-row">
          <div
            className={`ai-session-context${!activeSessionId ? ' is-none' : ''}`}
            data-testid="ai-session-context"
            data-status={convStatus}
            ref={targetRef}
            title={
              conversation
                ? tg('ai.contextHostTip', { host: conversationLabel(conversation.hostLabel, conversation.n) })
                : tg('ai.contextNoneTip')
            }
          >
            <button
              type="button"
              className="ai-conv-target"
              data-testid="ai-conv-target"
              aria-haspopup="menu"
              aria-expanded={targetOpen}
              aria-label={tg('ai.targetSwitch')}
              disabled={aiTargets.length === 0 || busy}
              onClick={() => setTargetOpen((v) => !v)}
            >
              <span className={`ai-conv-dot is-${convStatus}`} data-testid="ai-conv-dot" aria-hidden="true" />
              <span className="ai-session-context-host">
                {conversation ? conversation.hostLabel : tg('ai.generalChat')}
              </span>
              {conversation ? (
                <span className="ai-conv-n" data-testid="ai-conv-n">
                  · #{conversation.n}
                </span>
              ) : null}
              {aiTargets.length > 0 ? <Icon name="chevron-down" size={12} /> : null}
            </button>
            {workingGoal ? (
              <span className="ai-working-goal" title={workingGoal} data-testid="ai-working-goal">
                <span className="ai-working-goal-label">{tg('wm.goal')}</span>
                <span className="ai-working-goal-text">{workingGoal}</span>
              </span>
            ) : null}
            {memoryView && memoryView.count > 0 ? (
              <div className="ai-memory-wrap" ref={memoryRef} data-testid="ai-memory-wrap">
                <button
                  type="button"
                  className={`ai-memory-chip${memoryOpen ? ' is-open' : ''}`}
                  data-testid="ai-memory-chip"
                  aria-expanded={memoryOpen}
                  aria-controls="ai-memory-pop"
                  aria-label={`${tg('wm.memory')} · ${memoryView.count}`}
                  title={memoryView.summaryLine || tg('wm.memoryTitle')}
                  onClick={() => setMemoryOpen((v) => !v)}
                >
                  <span className="ai-memory-chip-label">{tg('wm.memory')}</span>
                  <span className="ai-memory-chip-count" data-testid="ai-memory-count">
                    · {memoryView.count}
                  </span>
                </button>
                {memoryOpen ? (
                  <div
                    id="ai-memory-pop"
                    className="titlebar-popover ai-memory-pop"
                    role="dialog"
                    data-testid="ai-memory-pop"
                    aria-label={tg('wm.memoryTitle')}
                  >
                    <div className="ai-pop-head">{tg('wm.memoryTitle')}</div>
                    <ul className="ai-memory-list" data-testid="ai-memory-list">
                      {memoryView.items.map((it, idx) => (
                        <li key={`${it.kind}-${idx}`} className="ai-memory-item" data-kind={it.kind} title={it.text}>
                          <span className="ai-memory-kind">
                            {it.kind === 'hostFact'
                              ? tg('wm.hostFact')
                              : it.kind === 'observation'
                                ? tg('wm.observation')
                                : tg('wm.recentCommand')}
                          </span>
                          <span className="ai-memory-text">{it.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {targetOpen ? (
              <div className="titlebar-popover ai-target-menu" role="menu" data-testid="ai-target-menu" aria-label={tg('ai.targetSwitch')}>
                <div className="ai-pop-head">{tg('ai.targetSwitch')}</div>
                {aiTargets.map((t) => (
                  <button
                    key={t.tabId}
                    type="button"
                    role="menuitemradio"
                    aria-checked={t.active}
                    className={t.active ? 'is-active' : ''}
                    data-testid="ai-target-option"
                    onClick={() => pickTarget(t)}
                  >
                    <span className="ai-conv-dot is-connected" aria-hidden="true" />
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {busy ? (
            <span className="ai-busy-chip" data-testid="ai-busy-chip" role="status" aria-live="polite">
              {tg('ai.busy')}
            </span>
          ) : null}
          <span className="ai-header-shortcut" data-testid="ai-focus-shortcut-hint" title={tg('ai.focusShortcutTip')}>
            <kbd>{keysFor('focusAiPanel') ?? 'Ctrl+Shift+A'}</kbd>
          </span>
          <button
            type="button"
            className="ai-icon-btn"
            data-testid="ai-new-chat"
            title={tg('ai.newChat')}
            aria-label={tg('ai.newChat')}
            disabled={busy}
            onClick={startNewChat}
          >
            <Icon name="plus" size={16} />
          </button>
          <div className="titlebar-popover-wrap" ref={historyRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              className="ai-icon-btn"
              data-testid="ai-history"
              title={tg('ai.history')}
              aria-label={tg('ai.history')}
              aria-haspopup="dialog"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <Icon name="history" size={16} />
            </button>
            {historyOpen ? (
              <div className="titlebar-popover ai-history-pop" role="dialog" aria-label={tg('ai.history')} data-testid="ai-history-pop">
                {archives.length === 0 ? (
                  <p className="ai-history-empty">{tg('ai.historyEmpty')}</p>
                ) : (
                  groupArchives(archives, conversation?.group ?? GENERAL_CONVERSATION_KEY).map((g) => (
                    <section key={g.group} className="ai-history-group" data-testid="ai-history-group" data-group={g.group}>
                      <div className="ai-pop-head">{g.hostLabel}</div>
                      {g.items.map((it) => (
                        <div key={it.id} className="ai-history-row" data-testid="ai-history-item">
                          <button
                            type="button"
                            className="ai-history-item"
                            disabled={busy}
                            title={it.title}
                            onClick={() => restoreArchived(it.id)}
                          >
                            <span className="ai-history-title">{it.title}</span>
                            <span className="ai-history-meta">
                              {new Date(it.savedAt).toLocaleString()} · {it.count}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="ai-history-del"
                            data-testid="ai-history-del"
                            disabled={busy || !window.aiss.ai.chatArchive?.remove}
                            title={tg('ai.deleteHistory')}
                            aria-label={tg('ai.deleteHistory')}
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteArchived(it.id)
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </section>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <div className="titlebar-popover-wrap" ref={moreRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              className="ai-icon-btn"
              data-testid="ai-more"
              title={tg('ai.moreMenu')}
              aria-label={tg('ai.moreMenu')}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            >
              …
            </button>
            {moreOpen ? (
              <div
                className="titlebar-popover ai-more-menu"
                role="menu"
                data-testid="ai-more-menu"
                style={{ right: 0, left: 'auto' }}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                  e.preventDefault()
                  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
                  const i = items.indexOf(document.activeElement as HTMLButtonElement)
                  const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
                  items[next]?.focus()
                }}
              >
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
                <button
                  type="button"
                  role="menuitem"
                  data-testid="ai-copy-chat-md"
                  disabled={busy || !lines.some((l) => l.role === 'assistant' && l.content.trim())}
                  title={tg('d86.tip')}
                  onClick={() => {
                    setMoreOpen(false)
                    // D86: whole conversation, redacted; clipboard only
                    const md = chatToMarkdown(lines, {
                      title: tg('d86.title'),
                      at: new Date(),
                      you: tg('d86.you'),
                      ai: tg('d86.ai'),
                      cmd: tg('d86.cmd')
                    })
                    void navigator.clipboard.writeText(md).then(
                      () => showToast(tg('d86.copied')),
                      () => showToast(tg('ai.copyFailed'), { kind: 'error' })
                    )
                  }}
                >
                  {tg('d86.copy')}
                </button>
                <div className="ai-more-sep" role="separator" />
                <button type="button" role="menuitem" className="danger" disabled={busy} onClick={() => { setMoreOpen(false); clearConversation() }}>
                  {tg('ai.clear')}
                </button>
                <button type="button" role="menuitem" disabled={busy || lines.length === 0} onClick={() => { setMoreOpen(false); undoLastRound() }} title={tg('ai.undoTip')}>
                  {tg('ai.undo')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {busy && turnElsewhere ? (
        <div className="ai-turn-elsewhere" role="status" data-testid="ai-turn-elsewhere">
          <span>{tg('ai.turnElsewhere', { host: turnElsewhere.host || tg('ai.contextSession') })}</span>
          {turnElsewhere.key && onSwitchToConversation ? (
            <button
              type="button"
              className="link-btn"
              data-testid="ai-turn-switch-back"
              onClick={() => onSwitchToConversation(turnElsewhere.key!)}
            >
              {tg('ai.turnSwitchBack')}
            </button>
          ) : null}
        </div>
      ) : null}
      {convOffline ? (
        <div className="ai-conv-offline" role="status" data-testid="ai-reconnect">
          <span>{tg('ai.reconnectToContinue')}</span>
          {onReconnect && conversation?.status === 'disconnected' ? (
            <button type="button" className="link-btn" data-testid="ai-reconnect-btn" onClick={onReconnect}>
              {tg('ai.reconnect')}
            </button>
          ) : null}
        </div>
      ) : !conversation ? (
        <div className="ai-conv-general" role="note" data-testid="ai-general-mode">
          {tg('ai.generalHint')}
        </div>
      ) : null}
      {panelProdAuto ? (
        <button
          type="button"
          className={`ai-prod-auto-banner${panelProdAuto.autoHighRisk ? ' is-high' : ''}`}
          data-testid="ai-prod-auto-banner"
          title={tg('prodAuto.tip', {
            source: tg(`policy.source.${panelProdAuto.source}` as 'policy.source.global')
          })}
          onClick={() => setSafetyOpen(true)}
        >
          <span className="ai-prod-auto-dot" aria-hidden="true" />
          <span className="ai-prod-auto-text">
            {panelProdAuto.autoHighRisk ? tg('prodAuto.chipHigh') : tg('prodAuto.chip')}
          </span>
          <span className="ai-prod-auto-hint">{tg('prodAuto.panelHint')}</span>
        </button>
      ) : null}

      
      {aiNeedsModelPick(currentModel, modelList) ? (
        <div className="ai-model-missing" data-testid="ai-model-missing" role="status">
          <span className="ai-model-missing-text">{tg('ai.modelMissing')}</span>
          {onOpenSettings ? (
            <button
              type="button"
              className="ai-fill-cmd-btn ai-btn-agree"
              data-testid="ai-model-missing-settings"
              onClick={() => onOpenSettings()}
            >
              {tg('a1.goSettings')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="ai-messages">
        {lines.length === 0 && (
          <div className="ai-reply-empty" data-testid="ai-reply-empty" role="status">
            <p>{tg(
              aiPolicy.effective === 'auto'
                ? 'ux64.emptyHintAuto'
                : aiPolicy.effective === 'suggest'
                  ? 'ux64.emptyHintSuggest'
                  : 'ux64.emptyHintAsk'
            )}</p>
            {resumeHit ? (
              <button
                type="button"
                className="ai-starter-prompt ai-resume-last" /* R13: full title on hover for ellipsis chip */
                data-testid="ai-resume-last"
                data-resume-kind={isTroubleshootTitle(resumeHit.title) ? 'troubleshoot' : 'chat'}
                title={(resumeHit.title || tg('ai.untitledChat')) + ' — ' + tg('d29.tip')}
                onClick={() => restoreArchived(resumeHit.id)}
              >
                {tg(isTroubleshootTitle(resumeHit.title) ? 'd29.resumeTroubleshoot' : 'd29.resume', { title: resumeHit.title || tg('ai.untitledChat') })}
              </button>
            ) : null}
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
              {myPrompts.map((p) => (
                <span key={p} className="ai-starter-prompt ai-my-prompt" data-testid="ai-my-prompt">
                  <button
                    type="button"
                    className="ai-my-prompt-text"
                    title={p}
                    onClick={() => {
                      setInput(p)
                      queueMicrotask(() => inputRef.current?.focus())
                    }}
                  >
                    {p}
                  </button>
                  <button
                    type="button"
                    className="ai-my-prompt-del"
                    data-testid="ai-my-prompt-del"
                    aria-label={tg('d95.delete')}
                    title={tg('d95.delete')}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirmDialog({ title: tg('d95.deleteTitle'), body: p, confirmText: tg('d95.delete'), danger: true })
                        if (ok) setMyPrompts(savePrompts(myPrompts.filter((x) => x !== p)))
                      })()
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {input.trim() ? (
                <button
                  type="button"
                  className="ai-starter-prompt ai-my-prompt-add"
                  data-testid="ai-my-prompt-add"
                  title={tg('d95.addTip', { max: AI_PROMPTS_MAX })}
                  onClick={() => {
                    const r = addPrompt(myPrompts, input)
                    if (r.ok) {
                      setMyPrompts(savePrompts(r.list))
                      showToast(tg('d95.added'))
                    } else showToast(tg(r.reason === 'full' ? 'd95.full' : r.reason === 'dup' ? 'd95.dup' : 'd95.empty', { max: AI_PROMPTS_MAX }))
                  }}
                >
                  + {tg('d95.add')}
                </button>
              ) : null}
            </div>
          </div>
        )}
        {lines.map((l, i) => {
          if (l.role === 'user') {
            return (
              <div key={i} className="msg user" data-testid="ai-user-msg">
                {l.content}
              </div>
            )
          }
          if (l.streaming) {
            const partial = (l.content || '').trim()
            return (
              <div key={i} className="msg assistant ai-structured ai-dark-card ai-card-streaming" data-testid="ai-reply-card" data-card="streaming">
                <div className="ai-stream-head">
                  <span className="ai-stream-label">{tg('ux64.streaming')}</span>
                  <button
                    type="button"
                    className="ai-fill-cmd-btn ai-btn-decline ai-stream-stop"
                    data-testid="ai-stream-stop"
                    title={tg('ai.stopTip')}
                    aria-label={tg('ai.stop')}
                    onClick={stopGeneration}
                  >
                    <span className="ai-btn-text">{tg('ai.stop')}</span>
                  </button>
                </div>
                {partial ? (
                  <pre className="ai-stream-partial" data-testid="ai-stream-partial">
                    {partial}
                  </pre>
                ) : null}
              </div>
            )
          }
          if (l.cancelled) {
            const partial = (l.content || '').trim()
            const onlyCancel = !partial || partial === tg('ai.cancelled')
            return (
              <div
                key={i}
                className="msg assistant ai-structured ai-dark-card ai-card-cancelled"
                data-testid="ai-reply-card"
                data-card="cancelled"
              >
                <div className="ai-stream-head">
                  <span className="ai-stream-label" data-testid="ai-cancelled-label">{tg('ai.cancelled')}</span>
                  <button
                    type="button"
                    className="ai-fill-cmd-btn ai-btn-agree"
                    data-testid="ai-cancelled-retry"
                    disabled={busy}
                    title={tg('ux64.retry')}
                    onClick={retryLastUser}
                  >
                    <span className="ai-btn-text">{tg('ux64.retry')}</span>
                  </button>
                </div>
                {!onlyCancel ? (
                  <pre className="ai-stream-partial" data-testid="ai-cancelled-partial">
                    {partial}
                  </pre>
                ) : null}
              </div>
            )
          }
          if (l.variant === 'error') {
            const openSettings = aiErrorPrimaryCta(l.errorCode) === 'settings'
            return (
              <div
                key={i}
                className="msg assistant ai-structured ai-dark-card ai-card-error"
                data-testid="ai-reply-card"
                data-card="error"
                data-error-code={l.errorCode || undefined}
                data-primary={openSettings ? 'settings' : 'retry'}
              >
                <div className="ai-reply-desc">{l.content}</div>
                {l.detail && l.detail !== l.content ? (
                  <details className="pf5-details">
                    <summary>{tg('pf5.details')}</summary>
                    <pre>{l.detail}</pre>
                  </details>
                ) : null}
                <div className="ai-reply-actions">
                  {openSettings && onOpenSettings ? (
                    <button
                      type="button"
                      className="ai-fill-cmd-btn ai-btn-agree"
                      data-testid="ai-error-open-settings"
                      disabled={busy}
                      onClick={() => onOpenSettings()}
                    >
                      {tg('a1.goSettings')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={openSettings ? 'ai-fill-cmd-btn' : 'ai-fill-cmd-btn ai-btn-agree'}
                    data-testid="ai-error-retry"
                    disabled={busy}
                    onClick={retryLastUser}
                  >
                    {tg('ux64.retry')}
                  </button>
                  {!openSettings && onOpenSettings ? (
                    <button
                      type="button"
                      className="ai-fill-cmd-btn"
                      data-testid="ai-error-open-settings"
                      disabled={busy}
                      onClick={() => onOpenSettings()}
                    >
                      {tg('a1.goSettings')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ai-fill-cmd-btn ai-btn-decline"
                    disabled={busy}
                    title={tg('ux64.clear')}
                    onClick={clearConversation}
                  >
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
              const stepNo = suggestionStepNo.get(i)
              return (
                <div
                  key={i}
                  className={`msg assistant ai-structured ai-dark-card ai-tool-strip${isSnapshot ? '' : ' ai-tool-strip--plan'}`}
                  data-testid="ai-reply-card"
                  data-card="tool"
                  data-step={stepNo || undefined}
                >
                  {!isSnapshot && (stepNo || s.riskLevel) ? (
                    <span className="ai-tool-meta" data-testid="ai-tool-meta">
                      {stepNo ? (
                        <span className="ai-step-index" data-testid="ai-step-index">
                          {tg('ai.stepIndex', { n: stepNo })}
                        </span>
                      ) : null}
                      {s.riskLevel ? <RiskBadge level={s.riskLevel} /> : null}
                    </span>
                  ) : null}
                  <span className={`ai-tool-step${isSnapshot ? '' : ' ai-tool-step--wrap'}`}>
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
            const metaText = [s.description, s.notes, s.action === 'command' ? s.command : ''].filter(Boolean).join('\n')
            const showBatchBar = Boolean(batchCopyText) && i === firstSuggestionIdx
            return (
              <Fragment key={i}>
              {showBatchBar ? (
                <div
                  className="ai-batch-copy-bar"
                  data-testid="ai-batch-copy-bar"
                  role="region"
                  aria-label={tg('ai.copyAllSteps')}
                >
                  <span className="ai-batch-copy-count" data-testid="ai-batch-copy-count">
                    {tg('ai.stepsCount', { n: suggestionCommands.length })}
                  </span>
                  <button
                    type="button"
                    className="ai-fill-cmd-btn ai-btn-batch-fill"
                    data-testid="ai-batch-fill-next"
                    title={tg('d16b.tip')}
                    aria-label={tg('d16b.fill', { n: suggestionCommands.length })}
                    onClick={() => {
                      const sid = activeSessionId
                      if (!sid) {
                        showToast(tg('d16.noSession'))
                        return
                      }
                      startScript(sid, suggestionCommands)
                    }}
                  >
                    {tg('d16b.fill', { n: suggestionCommands.length })}
                  </button>
                  <button
                    type="button"
                    className="ai-fill-cmd-btn ai-btn-batch-copy"
                    data-testid="ai-batch-copy"
                    title={tg('ai.copyAllStepsTip')}
                    aria-label={tg('ai.copyAllSteps')}
                    onClick={() => copyText(batchCopyText)}
                  >
                    {tg('ai.copyAllSteps')}
                  </button>
                </div>
              ) : null}
              <div
                className={`msg assistant ai-structured ai-dark-card${isConfirmable ? ' is-active-plan-step' : ''}${screenshotAuditFocusId && l.exec?.auditId === screenshotAuditFocusId ? ' is-audit-focus' : ''}`}
                data-testid="ai-reply-card"
                data-card={card}
                data-confirm-id={l.requestId || undefined}
                data-active-plan={isConfirmable ? '1' : undefined}
                data-exec-audit-id={l.exec?.auditId || undefined}
                data-exec-command={s.command || undefined}
                data-audit-focus={screenshotAuditFocusId && l.exec?.auditId === screenshotAuditFocusId ? '1' : undefined}
              >
                {isConfirmable ? (
                  <span
                    className="ai-active-plan-badge"
                    data-testid="ai-active-plan-step"
                    data-aligned-step={suggestionStepNo.get(i) ?? alignedPlan.step}
                    data-aligned-max={Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1)}
                  >
                    {tg('ai.activePlanStep', { n: suggestionStepNo.get(i) ?? alignedPlan.step, max: Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1) })}
                  </span>
                ) : null}
                <div className="ai-card-body">
                  <OpsReply text={s.description} confirm={false} skipCommand={s.command} />
                </div>
                {s.appAction ? <AiActionCard key={`${i}-${s.appAction.name}`} proposal={s.appAction} onRun={onAppAction} /> : null}
                {s.notes ? (
                  <div className="ai-reply-notes">
                    <OpsReply text={s.notes} confirm={false} skipCommand={s.command} />
                  </div>
                ) : null}
                {s.action === 'tool_call' && l.requestId ? (
                  <div className="ai-reply-cmd">
                    <div className="ai-cmd-head">
                      <span className="ai-tool-meta" data-testid="ai-tool-meta">
                        {suggestionStepNo.get(i) ? (
                          <span className="ai-step-index" data-testid="ai-step-index">
                            {tg('ai.stepIndex', { n: suggestionStepNo.get(i)! })}
                          </span>
                        ) : null}
                        <RiskBadge level={s.riskLevel} />
                      </span>
                      <span className="ai-code-lang">tool</span>
                    </div>
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
                  <div className="ai-reply-cmd" data-testid="ai-cmd-block" data-step={suggestionStepNo.get(i) || undefined}>
                    <div className="ai-cmd-head">
                      <span className="ai-tool-meta" data-testid="ai-tool-meta">
                        {suggestionStepNo.get(i) ? (
                          <span className="ai-step-index" data-testid="ai-step-index">
                            {tg('ai.stepIndex', { n: suggestionStepNo.get(i)! })}
                          </span>
                        ) : null}
                        <RiskBadge level={s.riskLevel} />
                      </span>
                      <span className="ai-code-lang">shell</span>
                      <button
                        type="button"
                        className="ai-meta-btn ai-cmd-copy"
                        data-testid="ai-cmd-copy"
                        title={tg('common.copy')}
                        aria-label={tg('common.copy')}
                        onClick={() => copyText(s.command!)}
                      >
                        <Icon name="clipboard-list" size={14} />
                      </button>
                      {/* D97: refill an executed / skipped / any card's command into the bar; never runs it */}
                      {conversation && activeSessionId ? (
                        <button
                          type="button"
                          className="ai-meta-btn ai-cmd-refill"
                          data-testid="ai-cmd-refill"
                          title={tg('d97.tip')}
                          aria-label={tg('d97.tip')}
                          onClick={() => {
                            aiOrigins.mark(activeSessionId, s.command!)
                            fillCommandBar(activeSessionId, s.command!)
                            showToast(tg('d15.filled'))
                          }}
                        >
                          {tg('d97.fill')}
                        </button>
                      ) : null}
                    </div>
                    <code className="ai-reply-cmd-code">{s.command}</code>
                    {commandActions({
                      command: s.command,
                      riskLevel: s.riskLevel,
                      safetyMode: l.safetyMode,
                      requestId: l.requestId,
                      fresh: l.fresh,
                      // 2.3: a replayed (already executed) command reads as executed, not as a fresh suggestion
                      decision: l.decision ?? (l.exec && l.exec.status !== 'blocked' ? 'agreed' : undefined),
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
                {l.exec ? (
                  <>
                    <ExecReplay
                      exec={l.exec}
                      host={conversation ? conversationLabel(conversation.hostLabel, conversation.n) : hostName || undefined}
                      command={s.command}
                      busy={busy}
                      onRetryWithEvidence={retryWithFailureEvidence}
                    />
                    {pendingConfirm && l.exec.status === 'failed' ? (
                      <button
                        type="button"
                        className="link-btn ai-failure-next-confirm"
                        data-testid="ai-failure-next-confirm"
                        title={tg('fail.nextConfirmTip')}
                        onClick={() => focusAiPendingAfterFailure(pendingConfirm?.requestId)}
                      >
                        {tg('fail.nextConfirm')}
                        {alignedPlan.step ? ` · ${tg('ai.activePlanStep', { n: alignedPlan.step, max: Math.max(alignedPlan.max, alignedPlan.step, 1) })}` : ''}
                      </button>
                    ) : null}
                  </>
                ) : null}
                {s.action === 'end' || s.action === 'command' ? <ReplyMeta text={metaText} elapsedMs={l.elapsedMs} /> : null}
              </div>
              </Fragment>
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
              <ReplyMeta text={l.content} elapsedMs={l.elapsedMs} />
            </div>
          )
        })}
        <div ref={tailRef} />
      </div>

      {pendingConfirm ? (
        <div
          className={`ai-pending-confirm${hasFailedExecPin(lines) ? ' is-after-failure' : ''}`}
          role="region"
          tabIndex={-1}
          aria-label={tg('ux64.pendingTitle')}
          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
          data-r19-narrow="1"
          data-after-failure={hasFailedExecPin(lines) ? '1' : undefined}
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
            <button
              type="button"
              className="ai-fill-cmd-btn"
              data-testid="ai-pending-open-audit"
              title={tg('exec.openHostAuditTip')}
              onClick={() => {
                const host = conversation
                  ? conversationLabel(conversation.hostLabel, conversation.n)
                  : hostName || undefined
                const cmd = pendingLine?.structured?.command?.trim() || pendingPreviewRaw?.trim() || undefined
                window.dispatchEvent(
                  new CustomEvent(OPEN_AUDIT_EVENT, {
                    detail: { host, source: 'AI', type: 'command', text: cmd }
                  })
                )
              }}
            >
              <span className="ai-btn-text">{tg('exec.openHostAudit')}</span>
            </button>
          </div>
        </div>
      ) : null}

      <div className="ai-input-row">
        <div className="ai-composer" data-testid="ai-composer">
          {pasteBlocks.length ? (
            <div className="ai-paste-blocks">
              {pasteBlocks.map((b) => (
                <div key={b.id} className="ai-paste-block" data-testid="ai-paste-block">
                  <div className="ai-paste-block-head">
                    <span className="ai-paste-block-title">
                      {tg('d94.title', { n: b.lines })}
                      {b.redacted ? <span className="ai-paste-block-red">{tg('d94.redacted')}</span> : null}
                    </span>
                    <button type="button" data-testid="ai-paste-toggle" onClick={() => setOpenBlock((x) => (x === b.id ? null : b.id))}>
                      {openBlock === b.id ? tg('d94.collapse') : tg('d94.expand')}
                    </button>
                    <button
                      type="button"
                      data-testid="ai-paste-remove"
                      aria-label={tg('d94.remove')}
                      title={tg('d94.remove')}
                      onClick={() => {
                        void (async () => {
                          const ok = await confirmDialog({ title: tg('d94.removeTitle'), body: tg('d94.title', { n: b.lines }), confirmText: tg('d94.remove'), danger: true })
                          if (ok) setPasteBlocks((prev) => prev.filter((x) => x.id !== b.id))
                        })()
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {openBlock === b.id ? <pre className="ai-paste-block-body">{b.fenced}</pre> : <pre className="ai-paste-block-preview">{b.preview.join('\n')}</pre>}
                </div>
              ))}
            </div>
          ) : null}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              recallRef.current = -1
              setInput(e.target.value)
            }}
            onPaste={(e) => {
              // D94: long logs become a collapsed, redacted block instead of flooding the input
              const pasted = e.clipboardData.getData('text/plain')
              if (!pasted || !shouldCollapsePaste(pasted)) return
              e.preventDefault()
              setPasteBlocks((prev) => [...prev, buildPasteBlock(pasted, `pb-${Date.now()}-${prev.length}`)])
            }}
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
              // P39: IME composition (pinyin) owns Enter / arrows; never send or recall mid-composition
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              // D52: ↑ on an empty box (or while recalling) brings back earlier questions; ↓ walks forward
              if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                const ta = e.currentTarget
                const atEdge = e.key === 'ArrowUp' ? ta.selectionStart === 0 : ta.selectionEnd === ta.value.length
                const step = atEdge ? recallStep(userPrompts(lines), recallRef.current, input, e.key === 'ArrowUp' ? 'up' : 'down') : null
                if (step) {
                  e.preventDefault()
                  recallRef.current = step.cursor
                  setInput(step.text)
                  return
                }
              }
              // 聊天输入：默认按 Enter 发送；按 Shift+Enter 换行。
              if (e.key === 'Enter' && !e.shiftKey) {
                recallRef.current = -1
                e.preventDefault()
                void send()
              }
            }}
          />
          <div className="ai-composer-bar" data-testid="ai-composer-bar">
            {modelList.length > 0 ? (
              <div className="ai-chip-wrap ai-model-wrap" ref={modelRef}>
                <button
                  type="button"
                  className="ai-chip ai-model-chip"
                  data-testid="ai-provider-select"
                  aria-haspopup="menu"
                  aria-expanded={modelOpen}
                  aria-label={tg('ai.model')}
                  title={`${tg('ai.model')}: ${currentModel}`}
                  disabled={busy}
                  onClick={() => setModelOpen((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault()
                      setModelOpen(true)
                    }
                  }}
                >
                  <span className="ai-model-chip-label">{shortModelName(currentModel)}</span>
                  <Icon name="chevron-down" size={12} />
                </button>
                {modelOpen ? (
                  <div
                    className="ai-chip-menu ai-model-menu"
                    role="menu"
                    aria-label={tg('ai.model')}
                    data-testid="ai-model-menu"
                    onKeyDown={(e) => menuKeyNav(e, () => setModelOpen(false))}
                  >
                    {modelList.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="menuitemradio"
                        aria-checked={m === currentModel}
                        className={`ai-chip-menu-item${m === currentModel ? ' is-current' : ''}`}
                        data-testid="ai-model-option"
                        title={m}
                        onClick={() => {
                          setModelOpen(false)
                          onModelChange(m)
                        }}
                      >
                        <span className="ai-chip-menu-check" aria-hidden="true">
                          {m === currentModel ? <Icon name="check" size={12} /> : null}
                        </span>
                        <span className="ai-chip-menu-label">{m}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="ai-chip-wrap" ref={safetyRef}>
              <button
                type="button"
                className={`ai-chip ai-safety-chip safety-band-${safetyBandTone(ladderBand)}${aiPolicy.source === 'temp' ? ' is-temp' : ''}${safetyOpen ? ' is-open' : ''}`}
                data-testid="ai-safety-chip"
                data-band={ladderBand}
                data-policy={aiPolicy.effective}
                data-source={aiPolicy.source}
                data-capped={aiPolicy.cappedBy ?? ''}
                data-chip-short={tg(`policy.chip.${aiPolicy.effective}` as 'policy.chip.ask')}
                aria-haspopup="menu"
                aria-expanded={safetyOpen}
                aria-label={`${tg('ai.safetyChipTip')}: ${policyChipTitle}`}
                title={policyChipTitle}
                onClick={() => setSafetyOpen((v) => !v)}
              >
                <Icon name="shield" size={12} />
                <span className="ai-safety-chip-label" data-testid="ai-safety-chip-label">
                  {tg(`policy.chip.${aiPolicy.effective}` as 'policy.chip.ask')}
                </span>
                {aiPolicy.cappedBy ? <span className="ai-chip-cap" data-testid="ai-safety-cap" aria-hidden="true">·</span> : null}
                <Icon name="chevron-down" size={12} />
              </button>
              {safetyOpen ? (
                <div
                  className="ai-chip-menu ai-safety-pop"
                  role="menu"
                  aria-label={tg('ai.safetyChipTip')}
                  data-testid="ai-safety-pop"
                  onKeyDown={(e) => menuKeyNav(e, () => setSafetyOpen(false))}
                >
                  <div className="ai-safety-row" data-testid="safety-scope">
                    <div className="ai-safety-head">
                      <span className="ai-safety-title">{tg('policy.popTitle')}</span>
                      <span
                        className={`safety-band-badge safety-band-${safetyBandTone(ladderBand)} is-active`}
                        data-testid="safety-band-badge"
                        data-band={ladderBand}
                        data-policy={aiPolicy.effective}
                        title={tg('safety.ladderHint')}
                      >
                        {tg(`policy.${aiPolicy.effective}` as 'policy.ask')}
                      </span>
                    </div>
                    <div className="ai-safety-options" data-testid="safety-temp" role="group" aria-label={tg('policy.tempTab')}>
                      {AI_POLICIES.map((id) => {
                        const capNote = policyOptionCap(id)
                        const canSet = Boolean(onSetTempPolicy && activeSessionId)
                        const disabled = Boolean(capNote) || !canSet
                        const current = id === aiPolicy.effective
                        return (
                          <button
                            key={id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={current}
                            aria-disabled={disabled}
                            className={`ai-chip-menu-item ai-safety-option${current ? ' is-current' : ''}${disabled ? ' is-disabled' : ''}`}
                            data-testid="ai-safety-option"
                            data-policy={id}
                            onClick={() => {
                              if (disabled) return
                              onSetTempPolicy?.(id === hostOrGlobalPolicy ? undefined : id)
                              setSafetyOpen(false)
                            }}
                          >
                            <span className="ai-chip-menu-check" aria-hidden="true">
                              {current ? <Icon name="check" size={12} /> : null}
                            </span>
                            <span className="ai-chip-menu-text">
                              <span className="ai-chip-menu-label">{tg(`policy.${id}` as 'policy.ask')}</span>
                              <span className="ai-chip-menu-hint" data-testid={capNote ? 'ai-safety-option-cap' : undefined}>
                                {capNote || tg(`policy.${id}Short` as 'policy.askShort')}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {!activeSessionId ? <p className="ai-policy-note">{tg('policy.needSession')}</p> : null}
                    <p className="ai-policy-effective" data-testid="ai-policy-effective" data-capped={aiPolicy.cappedBy ?? ''}>
                      {tg('policy.effective', { policy: tg(`policy.${aiPolicy.effective}` as 'policy.ask') })}
                      {policyCap ? <span className="ai-policy-cap">{policyCap}</span> : null}
                    </p>
                    <p className="ai-policy-source" data-testid="ai-policy-source" data-source={aiPolicy.source}>
                      {tg(`policy.source.${aiPolicy.source}` as 'policy.source.global')}
                      {aiPolicy.source !== 'global' && aiPolicy.chosen !== aiPolicy.effective
                        ? ` · ${tg('policy.chosen', { policy: tg(`policy.${aiPolicy.chosen}` as 'policy.ask') })}`
                        : ''}
                    </p>
                    <div className="ai-safety-links">
                      {aiPolicy.source === 'temp' && onSetTempPolicy ? (
                        <button type="button" className="ai-safety-link" data-testid="safety-temp-reset" onClick={() => onSetTempPolicy(undefined)}>
                          {tg('policy.tempReset')}
                        </button>
                      ) : null}
                      {aiPolicy.source === 'temp' && onSetHostPolicy && isAiPolicy(tempPolicy) ? (
                        <button
                          type="button"
                          className="ai-safety-link"
                          data-testid="safety-host"
                          onClick={() => {
                            onSetHostPolicy(tempPolicy)
                            onSetTempPolicy?.(undefined)
                          }}
                        >
                          {tg('policy.saveForHost')}
                        </button>
                      ) : null}
                      {onOpenHostSafety && activeSessionId ? (
                        <button
                          type="button"
                          className="ai-safety-link"
                          data-testid="safety-open-host"
                          onClick={() => {
                            setSafetyOpen(false)
                            onOpenHostSafety()
                          }}
                        >
                          {tg('policy.openHostSafety')}
                        </button>
                      ) : null}
                      {onOpenSettings ? (
                        <button
                          type="button"
                          className="ai-safety-link"
                          data-testid="safety-open-global"
                          onClick={() => {
                            setSafetyOpen(false)
                            onOpenSettings()
                          }}
                        >
                          {tg('policy.openGlobal')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={`ai-chip ai-attach-chip${includeTerminal && activeSessionId ? ' is-on' : ''}`}
              data-testid="ai-attach-output"
              aria-pressed={includeTerminal && Boolean(activeSessionId)}
              disabled={!activeSessionId}
              title={activeSessionId ? tg('ai.attachOutput') : tg('ai.needSsh')}
              aria-label={tg('ai.attachOutput')}
              onClick={() => setIncludeTerminal((v) => !v)}
            >
              <Icon name="monitor" size={12} />
            </button>
            <button
              type="button"
              className="ai-chip ai-console-chip"
              data-testid="ai-send-console"
              disabled={!activeSessionId || busy || snapshotBusy}
              title={activeSessionId ? tg('ai.sendConsoleTip') : tg('ai.needTab')}
              aria-label={tg('ai.sendConsole')}
              onClick={() => void sendConsoleToAi()}
            >
              <Icon name="file-text" size={12} />
              <span>{snapshotBusy ? tg('ai.readingTerm') : tg('ai.consoleChip')}</span>
            </button>
            <span className="ai-composer-spacer" />
            {busy && runProgress ? (
              <span
                className="ai-run-steps"
                data-testid="ai-run-steps"
                data-policy={runProgress.policy || undefined}
                data-aligned-step={alignedPlan.step}
                data-aligned-max={alignedPlan.max}
                data-step-source={alignedPlan.source}
                title={runProgress.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')}
              >
                {tg('ai.runSteps', { n: alignedPlan.step, max: alignedPlan.max })}
                {runProgress.policy === 'auto' &&
                typeof runProgress.streak === 'number' &&
                typeof runProgress.streakCap === 'number' &&
                runProgress.streakCap > 0 ? (
                  <span
                    className={`ai-run-streak${runProgress.forced ? ' is-forced' : ''}`}
                    data-testid="ai-run-streak"
                    title={runProgress.forced ? tg('ai.runStreakForced') : tg('ai.runStreakTip')}
                  >
                    {runProgress.forced
                      ? tg('ai.runStreakForced')
                      : tg('ai.runStreak', { n: runProgress.streak, max: runProgress.streakCap })}
                  </span>
                ) : null}
              </span>
            ) : null}
            {busy ? (
              <button
                type="button"
                className="ai-composer-send is-stop"
                data-testid="ai-stop"
                title={tg('ai.stopTip')}
                aria-label={tg('ai.stop')}
                onClick={stopGeneration}
              >
                <Icon name="square" size={12} />
              </button>
            ) : (
              <Button
                variant="primary"
                className="ai-composer-send"
                data-testid="ai-send"
                disabled={(!input.trim() && !pasteBlocks.length) || convOffline}
                title={tg('ai.send')}
                aria-label={tg('ai.send')}
                onClick={() => void send()}
              >
                <Icon name="arrow-up" size={14} strokeWidth={2} />
              </Button>
            )}
          </div>
        </div>
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
