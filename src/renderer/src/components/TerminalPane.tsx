import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { tg } from '../lib/i18n'
import Icon from './Icon'
import { openContextMenu, type ContextMenuItem } from './ContextMenu'
import { pathFromSelection } from '@shared/term-path'
import { requestSftpGoto } from '../lib/sftp-goto'
import { selectionWithLastRun } from '../lib/failed-output'
import { Terminal, type IMarker } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPrefs } from '@shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '@shared/ipc'
import { AISS_INJECT_TERMINAL_EVENT } from '../lib/terminal-inject'
import { getXtermTheme } from '../lib/terminal-themes'
import { attachZmodem, type ZmodemAttach } from '../lib/zmodem-attach'
import { findAllInBuffer, compileFind, pickMatch, seedQueryFromSelection, AISS_TERMINAL_FIND_EVENT } from '../lib/terminal-find'
import { looksLikeError, rememberError, requestAiExplain, requestSelectionExplain } from '../lib/ai-events'
import { registerTerminalSelection } from '../lib/terminal-selection'
import { showToast } from '../lib/toast'
import { extractPromptCommand, ghostSuffix, rankSuggestions, terminalKeyAction } from '@shared/smart-complete'
import { loadSmartHistory, loadSmartPrefs, seedDemoHistory } from '../lib/smart-history'
import { isDemoSessionId } from '@shared/demo-host'
import { HISTORY_CHANGED_EVENT } from '../lib/workspace-events'
import { parseOsc52Payload } from '@shared/osc52'
import { cwdFromOsc7, cwdFromPrompt, cwdFromWinPrompt } from '@shared/session-cwd'
import { planPaste, type PastePlan } from '@shared/paste-plan'
import { canSkipHost, pasteDecision } from '@shared/paste-skip'
import { isStrictPasteHost, pasteSkipHost, setPasteSkipHost } from '../lib/paste-pref'
import { requestAskWithContext } from '../lib/ai-prefill'
import { dropTargetDir, typedCommandOnEnter } from '@shared/typed-command'
import { setPendingUpload } from '../lib/pending-upload'
import { getSessionCwd } from '../lib/session-cwd-store'
import { noteSubmitted } from '../lib/ai-events'
import { setSessionCwd } from '../lib/session-cwd-store'
import { COMMAND_SUBMITTED_EVENT } from '../lib/ai-events'
import { blockNavIndex, blockNavKey } from '@shared/block-nav'
import { blockMatcher, effectiveScope, loadFindScope, saveFindScope, type FindScope } from '@shared/find-scope'
import { blocksEnabled } from '@shared/terminal-blocks'
import { BLOCKS_HITS_EVENT, BLOCKS_QUERY_EVENT, BLOCKS_STEP_EVENT, type BlocksHitsDetail } from '../lib/find-bridge'
import { SHELL_INT_TIMEOUT_MS, atIdlePrompt, canInject, isNewTyped, parseOsc133, parseOsc133E, shellIntegrationScript } from '@shared/shell-integration'
import { SHELL_CMD_EVENT, SHELL_EXIT_EVENT, SHELL_INT_EVENT, integrationState, noteInjected, noteMarker, shellIntOn, wasInjected } from '../lib/shell-integration'

type Props = {
  sessionId: string
  active: boolean
  prefs?: TerminalPrefs
  /** Display-only: subscribe to ssh:data but do not send keystrokes */
  mirrorOnly?: boolean
  /**
   * Optional hook for broadcast / coordinated input.
   * When provided, called with user keystrokes instead of (or in addition via caller) writing.
   * If omitted and not mirrorOnly, writes via window.aiss.ssh.write.
   */
  onUserData?: (data: string) => void
  /** Optional ref updated with the latest write handler (for external broadcast fan-in). */
  broadcastRef?: MutableRefObject<((data: string) => void) | null>
  hostKey?: string
  /** S2 read-only: swallow keystrokes and tell the caller. */
  inputBlocked?: boolean
  onInputBlocked?: () => void
  /** D7: open SFTP for this terminal at its cwd. */
  onOpenSftp?: (sessionId: string) => void
}

/** Electron 中 xterm 会把 Ctrl+C / Ctrl+V 当控制字符发给 SSH；此处对接系统剪贴板。 */
function attachTerminalClipboardKeys(term: Terminal, before?: (ev: KeyboardEvent) => boolean, paste: (text: string) => void = (t) => term.paste(t)): void {
  term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
    if (ev.type === 'keydown' && before && before(ev) === false) return false
    if (ev.type !== 'keydown') return true

    const mod = ev.ctrlKey || ev.metaKey
    const keyLower = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key

    const isPaste =
      (mod && keyLower === 'v' && !ev.shiftKey) ||
      (ev.ctrlKey && ev.shiftKey && keyLower === 'v') ||
      (ev.shiftKey && ev.key === 'Insert' && !ev.ctrlKey && !ev.metaKey && !ev.altKey)

    if (isPaste) {
      ev.preventDefault()
      void navigator.clipboard.readText().then((text) => {
        if (text) paste(text)
      })
      return false
    }

    // 有选区：Ctrl/Cmd+C、Ctrl+Shift+C、Ctrl+Insert → 复制（无选区时 Ctrl+C 仍发给远端作中断）
    const isCopy =
      (mod && keyLower === 'c' && !ev.shiftKey) ||
      (ev.ctrlKey && ev.shiftKey && keyLower === 'c') ||
      (ev.ctrlKey && ev.key === 'Insert')

    if (term.hasSelection() && isCopy) {
      ev.preventDefault()
      void navigator.clipboard.writeText(term.getSelection())
      term.clearSelection()
      return false
    }

    return true
  })
}

function resolvePrefs(prefs?: TerminalPrefs): TerminalPrefs {
  return prefs ?? TERMINAL_PREFS_DEFAULTS
}

export default function TerminalPane({
  sessionId,
  active,
  prefs,
  mirrorOnly = false,
  onUserData,
  broadcastRef,
  hostKey = '',
  inputBlocked = false,
  onInputBlocked,
  onOpenSftp
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<{ term: Terminal; fit: FitAddon } | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const mirrorOnlyRef = useRef(mirrorOnly)
  mirrorOnlyRef.current = mirrorOnly
  const onUserDataRef = useRef(onUserData)
  onUserDataRef.current = onUserData
  const inputBlockedRef = useRef(inputBlocked)
  inputBlockedRef.current = inputBlocked
  const onOpenSftpRef = useRef(onOpenSftp)
  onOpenSftpRef.current = onOpenSftp
  const onInputBlockedRef = useRef(onInputBlocked)
  onInputBlockedRef.current = onInputBlocked
  const prefsRef = useRef(resolvePrefs(prefs))
  prefsRef.current = resolvePrefs(prefs)
  const osc52EnabledRef = useRef(prefsRef.current.osc52Clipboard !== false)
  osc52EnabledRef.current = prefsRef.current.osc52Clipboard !== false
  const muteBellRef = useRef(prefsRef.current.muteBell === true)
  muteBellRef.current = prefsRef.current.muteBell === true
  const [zmodemStatus, setZmodemStatus] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  // D7: multi-line paste waits here for a decision
  // D9: files dragged over the terminal → upload target hint
  const [dropHint, setDropHint] = useState<string | null>(null)
  const [pastePreview, setPastePreview] = useState<{ text: string; plan: PastePlan; strict: boolean; bracketed: boolean } | null>(null)
  const guardedPasteRef = useRef<(text: string) => void>(() => {})
  const [findQuery, setFindQuery] = useState('')
  const [findMiss, setFindMiss] = useState(false)
  const [findCase, setFindCase] = useState(false)
  const [findRegex, setFindRegex] = useState(false)
  const [findCount, setFindCount] = useState<{ index: number; total: number } | null>(null)
  // D19: one search entry — scope terminal / blocks
  const [findScopePref, setFindScopePref] = useState<FindScope>(() => loadFindScope())
  const [blocksOnHere, setBlocksOnHere] = useState(() => blocksEnabled())
  const [blockHits, setBlockHits] = useState<{ index: number; total: number } | null>(null)
  useEffect(() => {
    const sync = () => setBlocksOnHere(blocksEnabled())
    window.addEventListener('aiss-blocks', sync)
    return () => window.removeEventListener('aiss-blocks', sync)
  }, [])
  const findScope = effectiveScope(findScopePref, blocksOnHere)
  const findScopeRef = useRef<(s: FindScope) => void>(() => undefined)
  findScopeRef.current = (s) => setFindScopePref(saveFindScope(s))
  const findInputRef = useRef<HTMLInputElement>(null)
  const findPosRef = useRef<{ row: number; col: number } | null>(null)
  // A1: "Explain with AI" hint after output that looks like an error (auto-hides after 8 s)
  const [aiHint, setAiHint] = useState(false)
  const aiHintTimerRef = useRef<number | null>(null)
  const ghostRef = useRef({ suffix: '', atEnd: true })
  const [ghost, setGhost] = useState<{ suffix: string; x: number; y: number } | null>(null)
  const hostKeyRef = useRef(hostKey)
  hostKeyRef.current = hostKey

  /** Last N lines of the terminal buffer (plain text), used as context for "Explain with AI". */
  const recentText = (maxLines = 40): string => {
    const term = apiRef.current?.term
    if (!term) return ''
    const buf = term.buffer.active
    const out: string[] = []
    for (let i = Math.max(0, buf.length - 400); i < buf.length; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '')
    while (out.length && !out[out.length - 1]!.trim()) out.pop()
    return out.slice(-maxLines).join('\n')
  }
  const explainWithAi = (source: 'auto' | 'selection') => {
    const term = apiRef.current?.term
    const sel = source === 'selection' && term?.hasSelection() ? term.getSelection() : ''
    setAiHint(false)
    requestAiExplain({ sessionId, text: sel || recentText(), source })
  }

  useEffect(() => {
    if (!active) return
    return registerTerminalSelection(() => {
      const term = apiRef.current?.term
      return { sessionId, text: term?.hasSelection() ? term.getSelection() : '' }
    })
  }, [active, sessionId])

  useEffect(() => {
    const onFind = (e: Event) => {
      if (!activeRef.current) return
      const want = (e as CustomEvent<{ scope?: FindScope } | undefined>).detail?.scope
      if (want) findScopeRef.current(want)
      const term = apiRef.current?.term
      const seed = term?.hasSelection() ? seedQueryFromSelection(term.getSelection()) : ''
      if (seed) {
        setFindQuery(seed)
        findPosRef.current = null
      }
      setFindOpen(true)
      window.setTimeout(() => findInputRef.current?.select(), 0)
    }
    window.addEventListener(AISS_TERMINAL_FIND_EVENT, onFind)
    return () => window.removeEventListener(AISS_TERMINAL_FIND_EVENT, onFind)
  }, [])

  const findError = findQuery
    ? findScope === 'blocks'
      ? blockMatcher(findQuery, { caseSensitive: findCase, regex: findRegex }) === 'error'
        ? 'regex'
        : null
      : compileFind(findQuery, { caseSensitive: findCase, regex: findRegex }).error
    : null
  // D19: blocks scope drives the strip's filter; closing the bar or switching back clears it
  useEffect(() => {
    const q = findOpen && findScope === 'blocks' ? findQuery : ''
    window.dispatchEvent(new CustomEvent(BLOCKS_QUERY_EVENT, { detail: { sessionId, query: q, caseSensitive: findCase, regex: findRegex } }))
  }, [findOpen, findScope, findQuery, findCase, findRegex, sessionId])
  useEffect(() => {
    const onHits = (e: Event) => {
      const d = (e as CustomEvent<BlocksHitsDetail>).detail
      if (d && d.sessionId === sessionId) setBlockHits({ index: d.index, total: d.total })
    }
    window.addEventListener(BLOCKS_HITS_EVENT, onHits)
    return () => window.removeEventListener(BLOCKS_HITS_EVENT, onHits)
  }, [sessionId])
  const runFind = (backwards: boolean, restart = false) => {
    if (findScope === 'blocks') {
      if (!restart) window.dispatchEvent(new CustomEvent(BLOCKS_STEP_EVENT, { detail: { sessionId, back: backwards } }))
      return
    }
    const term = apiRef.current?.term
    if (!term) return
    if (!findQuery || findError) {
      setFindCount(null)
      setFindMiss(false)
      return
    }
    const buf = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '')
    const matches = findAllInBuffer(lines, findQuery, { caseSensitive: findCase, regex: findRegex })
    const from = restart && findPosRef.current ? { row: findPosRef.current.row, col: findPosRef.current.col - 1 } : findPosRef.current
    const idx = pickMatch(matches, from, backwards)
    setFindMiss(idx < 0)
    setFindCount(idx < 0 ? { index: 0, total: 0 } : { index: idx + 1, total: matches.length })
    if (idx < 0) {
      term.clearSelection()
      return
    }
    const hit = matches[idx]!
    findPosRef.current = { row: hit.row, col: hit.col }
    term.select(hit.col, hit.row, hit.len)
    term.scrollToLine(Math.max(0, hit.row - Math.floor(term.rows / 2)))
  }
  const runFindRef = useRef(runFind)
  runFindRef.current = runFind
  // Live search while typing / toggling options (keeps the current match when it still matches)
  useEffect(() => {
    if (findOpen) runFindRef.current(false, true)
  }, [findOpen, findQuery, findCase, findRegex, findScope])
  const blocksMiss = findScope === 'blocks' && !!findQuery.trim() && !findError && blockHits?.total === 0
  const shownCount = findScope === 'blocks' ? (findQuery.trim() && blockHits && blockHits.total > 0 ? blockHits : null) : findCount


  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const initial = prefsRef.current
    const term = new Terminal({
      cursorBlink: true,
      fontSize: initial.fontSize,
      fontFamily: initial.fontFamily,
      scrollback: initial.scrollback,
      theme: getXtermTheme(initial.themeId)
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    term.onBell(() => {
      if (muteBellRef.current) return
      const host = wrapRef.current?.parentElement ?? wrapRef.current
      if (!host) return
      host.classList.add('terminal-bell-flash')
      window.setTimeout(() => host.classList.remove('terminal-bell-flash'), 180)
    })
    const writeInput = (data: string) => {
      if (inputBlockedRef.current) {
        onInputBlockedRef.current?.()
        return
      }
      // D10: a command typed at the prompt starts a command block
      if (data === '\r') {
        const b = term.buffer.active
        const line = b.getLine(b.baseY + b.cursorY)?.translateToString(true) ?? ''
        const cmd = typedCommandOnEnter(data, line.slice(0, Math.min(b.cursorX, line.length)), b.type === 'alternate')
        if (cmd) noteSubmitted(sessionId, cmd)
      }
      if (onUserDataRef.current) {
        onUserDataRef.current(data)
        return
      }
      void window.aiss.ssh.write(sessionId, data)
    }
    guardedPasteRef.current = (text: string) => {
      const plan = planPaste(text)
      const hk = hostKeyRef.current
      const strict = isStrictPasteHost(hk)
      const bracketed = Boolean(term.modes?.bracketedPasteMode)
      if (mirrorOnlyRef.current || pasteDecision(plan, { strict, skipHost: pasteSkipHost(hk), bracketed }) === 'paste') {
        term.paste(text)
        return
      }
      setPastePreview({ text, plan, strict, bracketed })
    }
    // Native paste (menu / middle click) goes through the same preview
    const onNativePaste = (ev: ClipboardEvent) => {
      const text = ev.clipboardData?.getData('text/plain') ?? ''
      if (!text || !planPaste(text).multiline) return
      ev.preventDefault()
      ev.stopPropagation()
      guardedPasteRef.current(text)
    }
    el.addEventListener('paste', onNativePaste, true)
    // D9: drop local files on the terminal → upload into this session's cwd via its SFTP panel
    const hasFiles = (ev: DragEvent) => Array.from(ev.dataTransfer?.types ?? []).includes('Files')
    let dropHintTimer = 0
    const onDragOver = (ev: DragEvent) => {
      if (!hasFiles(ev) || mirrorOnlyRef.current || !onOpenSftpRef.current) return
      ev.preventDefault()
      ev.stopPropagation()
      setDropHint(dropTargetDir(getSessionCwd(sessionId)))
      // dragover repeats while hovering; a cancelled drag may not send dragleave
      window.clearTimeout(dropHintTimer)
      dropHintTimer = window.setTimeout(() => setDropHint(null), 800)
    }
    const onDragLeave = (ev: DragEvent) => {
      if (ev.target === el || !el.contains(ev.relatedTarget as Node | null)) setDropHint(null)
    }
    const onDrop = (ev: DragEvent) => {
      if (!hasFiles(ev) || mirrorOnlyRef.current || !onOpenSftpRef.current) return
      ev.preventDefault()
      ev.stopPropagation()
      setDropHint(null)
      if (inputBlockedRef.current) {
        showToast(tg('ux34.noUpload'), { kind: 'error' })
        return
      }
      const paths = Array.from(ev.dataTransfer?.files ?? [])
        .map((f) => window.aiss.fs.pathForFile?.(f) || (f as File & { path?: string }).path)
        .filter((p): p is string => Boolean(p))
      if (!paths.length) {
        showToast(tg('sftp.dropNeedPath'), { kind: 'error' })
        return
      }
      setPendingUpload(sessionId, dropTargetDir(getSessionCwd(sessionId)), paths)
      onOpenSftpRef.current(sessionId)
    }
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    attachTerminalClipboardKeys(term, (ev) => {
      // D15: Ctrl+Up / Ctrl+Down jump between commands
      const nav = blockNavKey(ev, term.buffer.active.type === 'alternate')
      if (nav) {
        const live = blockMarks.filter((m) => !m.isDisposed && m.line >= 0)
        const b = term.buffer.active
        const idx = blockNavIndex(live.map((m) => m.line), b.viewportY, b.viewportY >= b.baseY, nav)
        ev.preventDefault()
        if (idx == null) {
          if (nav === 'next') term.scrollToBottom()
          return false
        }
        term.scrollToLine(live[idx]!.line)
        window.dispatchEvent(new CustomEvent('aiss-block-select', { detail: { sessionId, fromEnd: live.length - 1 - idx } }))
        return false
      }
      const action = terminalKeyAction(ev.key, { atEnd: ghostRef.current.atEnd, hasGhost: Boolean(ghostRef.current.suffix) })
      if (action === 'accept-ghost') {
        ev.preventDefault()
        const suffix = ghostRef.current.suffix
        ghostRef.current = { suffix: '', atEnd: true }
        setGhost(null)
        if (suffix) writeInput(suffix)
        return false
      }
      return true
    }, (t) => guardedPasteRef.current(t))
    const oscDisp = term.parser.registerOscHandler(52, (data) => {
      if (!osc52EnabledRef.current) return true
      const parsed = parseOsc52Payload(data)
      if (parsed.kind === 'write') {
        void navigator.clipboard.writeText(parsed.text).catch(() => {
          /* permission / focus */
        })
        return true
      }
      // Refuse clipboard queries — remote must not read local clipboard.
      if (parsed.kind === 'query') return true
      if (parsed.kind === 'clear') {
        void navigator.clipboard.writeText('').catch(() => {})
        return true
      }
      return true
    })

    // D2: remember cwd (OSC 7 or the bash prompt) so reconnect can return to it
    // D14: Shell Integration markers (OSC 133). D;<code> finishes the running block.
    let lastTypedNum: number | undefined
    const osc133Disp = term.parser.registerOscHandler(133, (data) => {
      const typed = parseOsc133E(data)
      if (typed) {
        noteMarker(sessionId)
        const fresh = isNewTyped(lastTypedNum, typed.num)
        lastTypedNum = typed.num
        if (fresh) window.dispatchEvent(new CustomEvent(SHELL_CMD_EVENT, { detail: { sessionId, command: typed.command } }))
        return true
      }
      const m = parseOsc133(data)
      if (!m) return true
      noteMarker(sessionId)
      if (m.kind === 'D' && m.code != null) window.dispatchEvent(new CustomEvent(SHELL_EXIT_EVENT, { detail: { sessionId, code: m.code } }))
      return true
    })
    const tryInject = () => {
      if (isDemoSessionId(sessionId)) return
      if (!canInject({ enabled: shellIntOn(), inputBlocked: Boolean(inputBlockedRef.current), mirrorOnly: Boolean(mirrorOnlyRef.current), alternate: term.buffer.active.type === 'alternate', already: wasInjected(sessionId), idle: (() => { const b = term.buffer.active; const line = b.getLine(b.baseY + b.cursorY)?.translateToString(true) ?? ''; return atIdlePrompt(line.slice(0, Math.min(b.cursorX, line.length))) })() })) return
      noteInjected(sessionId)
      void window.aiss.ssh.write(sessionId, `${shellIntegrationScript()}\r`)
      window.setTimeout(() => {
        if (integrationState(sessionId) === 'unsupported') showToast(tg('d14.unsupported'))
      }, SHELL_INT_TIMEOUT_MS + 100)
    }
    let siTimer = 0
    const firstParsed = term.onWriteParsed(() => {
      firstParsed.dispose()
      siTimer = window.setTimeout(tryInject, 1500)
    })
    window.addEventListener(SHELL_INT_EVENT, tryInject)
    // D15: a marker where each command starts
    const blockMarks: IMarker[] = []
    const onSubmittedMark = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string }>).detail
      if (d?.sessionId !== sessionId) return
      const mk = term.registerMarker(0)
      if (!mk) return
      blockMarks.push(mk)
      if (blockMarks.length > 300) blockMarks.shift()?.dispose()
    }
    window.addEventListener(COMMAND_SUBMITTED_EVENT, onSubmittedMark)
    const osc7Disp = term.parser.registerOscHandler(7, (data) => {
      const p = cwdFromOsc7(data)
      if (p) setSessionCwd(sessionId, p)
      return true
    })
    const cwdMove = term.onCursorMove(() => {
      const b = term.buffer.active
      const line = b.getLine(b.baseY + b.cursorY)?.translateToString(true) ?? ''
      const before = line.slice(0, Math.min(b.cursorX, line.length))
      const c = cwdFromPrompt(before) ?? (sessionId.startsWith('local:') ? cwdFromWinPrompt(before) : null)
      if (c) setSessionCwd(sessionId, c)
    })

    apiRef.current = { term, fit }

    let zm: ZmodemAttach | null = null
    let zmReady = false
    void attachZmodem({
      writeToTerminal: (data) => {
        term.write(data)
      },
      sendToPeer: (data) => {
        void window.aiss.ssh.write(sessionId, data)
      },
      onStatus: (text) => setZmodemStatus(text || null)
    })
      .then((api) => {
        zm = api
        zmReady = true
      })
      .catch(() => {
        zmReady = false
      })

    const toUint8 = (chunk: string | Uint8Array): Uint8Array => {
      if (typeof chunk === 'string') return new TextEncoder().encode(chunk)
      return chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk as ArrayBuffer)
    }

    const decoder = new TextDecoder()
    let errCheckTimer: number | null = null
    let pending = ''
    const checkForError = (u8: Uint8Array) => {
      if (mirrorOnlyRef.current) return
      pending = (pending + decoder.decode(u8, { stream: true })).slice(-4000)
      if (errCheckTimer != null) return
      errCheckTimer = window.setTimeout(() => {
        errCheckTimer = null
        const text = pending
        pending = ''
        if (!looksLikeError(text, sessionId)) return
        rememberError(sessionId, text)
        if (!activeRef.current) return
        setAiHint(true)
        if (aiHintTimerRef.current != null) window.clearTimeout(aiHintTimerRef.current)
        aiHintTimerRef.current = window.setTimeout(() => setAiHint(false), 8000)
      }, 250)
    }

    const unsubData = window.aiss.ssh.onData((p) => {
      if (p.sessionId !== sessionId) return
      const u8 = toUint8(p.chunk)
      checkForError(u8)
      if (zmReady && zm) {
        try {
          zm.consume(u8)
          // sentry 会把需要显示的字节回调到 to_terminal；探测期间也要尽量显示
          // zmodem.js consume 内部会决定是否 to_terminal，这里不要重复 write 全部
          // 但非 zmodem 数据需显示：库在非会话时会 to_terminal
          return
        } catch {
          /* fall through */
        }
      }
      term.write(u8)
      try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(u8)
        window.dispatchEvent(new CustomEvent('aiss-term-chunk', { detail: { sessionId, text } }))
      } catch {
        /* overlay is optional */
      }
    })

    if (broadcastRef) {
      broadcastRef.current = writeInput
    }

    const subInput = term.onData((data) => {
      if (mirrorOnlyRef.current) return
      writeInput(data)
    })

    const fitAndResize = () => {
      if (!activeRef.current) return
      try {
        fit.fit()
        void window.aiss.ssh.resize(sessionId, term.cols, term.rows)
      } catch {
        /* xterm 在尺寸为 0 时会抛错 */
      }
    }

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(fitAndResize)
    })
    ro.observe(el)
    requestAnimationFrame(fitAndResize)

    const onMouseUp = (): void => {
      if (term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection())
      }
    }
    const onContextMenu = (ev: MouseEvent): void => {
      const term = apiRef.current?.term
      const hasSel = Boolean(term?.hasSelection())
      const selPath = hasSel ? pathFromSelection(term?.getSelection() ?? '', getSessionCwd(sessionId)) : null
      const items: ContextMenuItem[] = [
        {
          id: 'copy',
          label: tg('common.copy'),
          shortcut: 'Ctrl+Shift+C',
          disabled: !hasSel,
          onSelect: () => {
            if (term?.hasSelection()) void navigator.clipboard.writeText(term.getSelection())
          }
        },
        {
          id: 'paste',
          label: tg('common.paste'),
          shortcut: 'Ctrl+Shift+V',
          disabled: mirrorOnlyRef.current,
          onSelect: () => {
            void navigator.clipboard.readText().then((text) => {
              if (text) guardedPasteRef.current(text)
            })
          }
        },
        {
          id: 'pasteRun',
          label: tg('ctx.pasteRun'),
          disabled: mirrorOnlyRef.current,
          onSelect: () => {
            void navigator.clipboard.readText().then((text) => {
              if (text) guardedPasteRef.current(text.endsWith('\r') || text.endsWith('\n') ? text : text + '\r')
            })
          }
        },
        'sep',
        {
          id: 'a6Explain',
          label: tg('a6.explain'),
          disabled: !hasSel,
          onSelect: () => {
            const text = term?.getSelection() ?? ''
            void requestSelectionExplain({ sessionId, text }).then((status) => {
              if (status === 'empty') showToast(tg('a6.needSelection'))
            })
          }
        },
        {
          id: 'aiExplain',
          label: tg('a1.explainSelection'),
          onSelect: () => explainWithAi('selection')
        },
        {
          id: 'aiAskCtx',
          label: tg('d6.ask'),
          disabled: !hasSel,
          onSelect: () => {
            // D46: include the last command + exit code so the AI sees what produced this output
            const sel = term?.getSelection() ?? ''
            if (!sel.trim() || !requestAskWithContext(sessionId, selectionWithLastRun(sessionId, sel))) showToast(tg('a6.needSelection'))
          }
        },
        'sep',
        {
          id: 'insertSnippet',
          label: tg('ctx.insertSnippet'),
          onSelect: () => window.dispatchEvent(new CustomEvent('aiss-open-right-panel', { detail: { pane: 'snippets', focusSearch: true } }))
        },
        {
          id: 'allSnippets',
          label: tg('ctx.allSnippets'),
          onSelect: () => window.dispatchEvent(new CustomEvent('aiss-open-right-panel', { detail: { pane: 'snippets' } }))
        },
        {
          id: 'saveAsSnippet',
          label: tg('ctx.saveAsSnippet'),
          disabled: !hasSel,
          onSelect: () => {
            const body = term?.getSelection() ?? ''
            window.dispatchEvent(new CustomEvent('aiss-open-right-panel', { detail: { pane: 'snippets', openForm: true, seed: body } }))
          }
        },
        'sep',
        {
          id: 'sftp',
          label: tg('ctx.sftp'),
          shortcut: 'Ctrl+Alt+F',
          disabled: mirrorOnlyRef.current,
          onSelect: () => onOpenSftpRef.current?.(sessionId)
        },
        {
          // D41: selected path → SFTP (file → its folder)
          id: 'sftpPath',
          label: tg('d41.openInSftp'),
          disabled: mirrorOnlyRef.current || !selPath,
          onSelect: () => {
            if (!selPath) return
            requestSftpGoto(sessionId, selPath)
            onOpenSftpRef.current?.(sessionId)
          }
        },
        {
          id: 'find',
          label: tg('term.find'),
          shortcut: 'Ctrl+Shift+F',
          onSelect: () => {
            setFindOpen(true)
            window.setTimeout(() => findInputRef.current?.select(), 0)
          }
        },
        {
          id: 'clear',
          label: tg('term.clear'),
          onSelect: () => apiRef.current?.term.clear()
        }
      ]
      openContextMenu(ev, items)
    }
    el.addEventListener('mouseup', onMouseUp)
    el.addEventListener('contextmenu', onContextMenu)

    const refreshGhost = () => {
      if (mirrorOnlyRef.current) return
      const smart = loadSmartPrefs()
      if (!smart.enabled || !smart.ghost) {
        ghostRef.current = { suffix: '', atEnd: true }
        setGhost(null)
        return
      }
      const buf = term.buffer.active
      const x = buf.cursorX
      const y = buf.cursorY
      const line = buf.getLine(buf.baseY + y)?.translateToString(true) ?? ''
      const before = line.slice(0, Math.min(x, line.length))
      const atEnd = line.slice(x).trim().length === 0
      const query = extractPromptCommand(before)
      if (!query || !query.trim()) {
        ghostRef.current = { suffix: '', atEnd }
        setGhost(null)
        return
      }
      const hk = hostKeyRef.current
      if (isDemoSessionId(sessionId) && hk) seedDemoHistory(hk)
      const ranked = rankSuggestions({
        query: query.trim(),
        hostKey: hk,
        entries: loadSmartHistory(),
        limit: 4,
        minChars: 1,
        sources: { host: smart.sourceHost, common: smart.sourceCommon, snippets: smart.sourceSnippets }
      })
      const suffix = ghostSuffix(query.trim(), ranked.map((r) => r.command)) || ''
      ghostRef.current = { suffix, atEnd }
      if (!suffix) {
        setGhost(null)
        return
      }
      const font = term.options.fontSize || 14
      setGhost({ suffix, x: 12 + x * font * 0.62, y: 8 + y * Math.round(font * 1.35) })
    }
    const ghostMove = term.onCursorMove(() => refreshGhost())
    const onHist = () => refreshGhost()
    window.addEventListener(HISTORY_CHANGED_EVENT, onHist)

    return () => {
      if (errCheckTimer != null) window.clearTimeout(errCheckTimer)
      if (aiHintTimerRef.current != null) window.clearTimeout(aiHintTimerRef.current)
      zm?.dispose()
      if (broadcastRef && broadcastRef.current === writeInput) {
        broadcastRef.current = null
      }
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('contextmenu', onContextMenu)
      ro.disconnect()
      ghostMove.dispose()
      el.removeEventListener('paste', onNativePaste, true)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
      window.clearTimeout(dropHintTimer)
      cwdMove.dispose()
      try { osc7Disp.dispose() } catch { /* ignore */ }
      try { osc133Disp.dispose() } catch { /* ignore */ }
      firstParsed.dispose()
      window.clearTimeout(siTimer)
      window.removeEventListener(SHELL_INT_EVENT, tryInject)
      window.removeEventListener(COMMAND_SUBMITTED_EVENT, onSubmittedMark)
      for (const m of blockMarks) m.dispose()
      window.removeEventListener(HISTORY_CHANGED_EVENT, onHist)
      subInput.dispose()
      unsubData()
      try { oscDisp.dispose() } catch { /* ignore */ }
      term.dispose()
      apiRef.current = null
    }
  }, [sessionId, broadcastRef])

  useEffect(() => {
    const onFocus = (ev: Event) => {
      const sid = (ev as CustomEvent<{ sessionId?: string }>).detail?.sessionId
      if (sid && sid !== sessionId) return
      apiRef.current?.term.focus()
    }
    window.addEventListener('aiss-focus-terminal', onFocus)
    return () => window.removeEventListener('aiss-focus-terminal', onFocus)
  }, [sessionId])

  useEffect(() => {
    const onClear = (ev: Event) => {
      const sid = (ev as CustomEvent<{ sessionId?: string }>).detail?.sessionId
      if (sid && sid !== sessionId) return
      apiRef.current?.term.clear()
    }
    window.addEventListener('aiss-clear-scrollback', onClear)
    return () => window.removeEventListener('aiss-clear-scrollback', onClear)
  }, [sessionId])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    const p = resolvePrefs(prefs)
    api.term.options.fontSize = p.fontSize
    api.term.options.fontFamily = p.fontFamily
    api.term.options.scrollback = p.scrollback
    api.term.options.theme = getXtermTheme(p.themeId)
    if (active) {
      requestAnimationFrame(() => {
        try {
          api.fit.fit()
          void window.aiss.ssh.resize(sessionId, api.term.cols, api.term.rows)
        } catch {
          /* ignore */
        }
      })
    }
  }, [prefs, active, sessionId])

  useEffect(() => {
    const onInject = (e: Event) => {
      const ce = e as CustomEvent<{ sessionId?: string; text?: string; execute?: boolean }>
      if (ce.detail?.sessionId !== sessionId) return
      if (mirrorOnlyRef.current) return
      const api = apiRef.current
      if (!api) return
      const text = (ce.detail.text ?? '').replace(/\r\n/g, '\n').replace(/[\r\n]/g, '')
      if (!text) return
      api.term.focus()
      const payload = ce.detail.execute ? `${text}\r` : text
      api.term.paste(payload)
    }
    window.addEventListener(AISS_INJECT_TERMINAL_EVENT, onInject)
    return () => window.removeEventListener(AISS_INJECT_TERMINAL_EVENT, onInject)
  }, [sessionId])

  useEffect(() => {
    if (!active) return
    const api = apiRef.current
    if (!api) return
    requestAnimationFrame(() => {
      try {
        api.fit.fit()
        void window.aiss.ssh.resize(sessionId, api.term.cols, api.term.rows)
      } catch {
        /* ignore */
      }
    })
  }, [active, sessionId])

  return (
    <>
      <div className="terminal-pane-wrap" data-terminal="true" data-session-id={sessionId}>
        <div ref={wrapRef} className="terminal-pane-xterm" title={tg('term.tip')} />
        {ghost && !mirrorOnly ? (
          <span className="term-ghost" data-testid="term-ghost" style={{ left: ghost.x, top: ghost.y }} title={tg('x1.acceptHint')}>
            {ghost.suffix}
          </span>
        ) : null}
        {zmodemStatus ? <div className="zmodem-status">{zmodemStatus}</div> : null}
        {aiHint && !mirrorOnly ? (
          <button type="button" className="ai-explain-hint" data-testid="ai-explain-hint" onClick={() => explainWithAi('auto')}>
            <Icon name="sparkles" size={14} /> {tg('a1.button')}
          </button>
        ) : null}
        {dropHint ? (
          <div className="term-drop-hint" data-testid="term-drop-hint" aria-live="polite">
            {tg('d9.dropHint', { dir: dropHint })}
          </div>
        ) : null}
        {pastePreview ? (
          <div className="paste-preview" role="dialog" aria-label={tg('d7.title', { n: pastePreview.plan.lines.length })} data-testid="paste-preview"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setPastePreview(null)
                apiRef.current?.term.focus()
              }
            }}
          >
            <div className="paste-preview-head">
              <strong>{tg('d7.title', { n: pastePreview.plan.lines.length })}</strong>
              {pastePreview.plan.risky.length ? <span className="paste-preview-risk">{tg('d7.risky', { n: pastePreview.plan.risky.length })}</span> : null}
            </div>
            <ol className="paste-preview-lines">
              {pastePreview.plan.lines.slice(0, 12).map((l, i) => {
                const r = pastePreview.plan.risky.find((x) => x.index === i)
                return (
                  <li key={i} className={r ? 'is-risky' : ''} title={r ? tg(r.reasonKey) : undefined}>
                    <code>{l || ' '}</code>
                  </li>
                )
              })}
            </ol>
            {pastePreview.plan.lines.length > 12 ? <div className="paste-preview-more">{tg('d7.more', { n: pastePreview.plan.lines.length - 12 })}</div> : null}
            <p className="paste-preview-hint">{pastePreview.bracketed ? tg('d7b.bracketed') : pastePreview.plan.runsLast ? tg('d7.runsAll') : tg('d7.runsButLast')}</p>
            {canSkipHost(pastePreview.strict, hostKeyRef.current) ? (
              <label className="paste-preview-skip" title={tg('d7b.skipTip')}>
                <input type="checkbox" data-testid="paste-preview-skip" defaultChecked={pasteSkipHost(hostKeyRef.current)}
                  onChange={(e) => setPasteSkipHost(hostKeyRef.current, e.currentTarget.checked)} />
                {tg('d7b.skip')}
              </label>
            ) : pastePreview.strict ? <p className="paste-preview-hint" data-testid="paste-preview-strict">{tg('d7b.strict')}</p> : null}
            <div className="paste-preview-actions">
              <button type="button" data-testid="paste-preview-cancel" autoFocus={pastePreview.plan.risky.length > 0}
                onClick={() => { setPastePreview(null); apiRef.current?.term.focus() }}>
                {tg('d7.cancel')}
              </button>
              <button type="button" data-testid="paste-preview-join" disabled={!pastePreview.plan.joined}
                title={pastePreview.plan.joined ? pastePreview.plan.joined : tg('d7.joinDisabled')}
                onClick={() => {
                  const j = pastePreview.plan.joined
                  setPastePreview(null)
                  if (j) apiRef.current?.term.paste(j)
                  apiRef.current?.term.focus()
                }}>
                {tg('d7.join')}
              </button>
              <button type="button" className="is-primary" data-testid="paste-preview-all" autoFocus={pastePreview.plan.risky.length === 0}
                onClick={() => {
                  const t = pastePreview.text
                  setPastePreview(null)
                  apiRef.current?.term.paste(t)
                  apiRef.current?.term.focus()
                }}>
                {tg('d7.pasteAll')}
              </button>
            </div>
          </div>
        ) : null}
        {findOpen ? (
          <div className="terminal-find-bar" role="search" data-testid="terminal-find" data-scope={findScope}>
            {blocksOnHere ? (
              <span className="terminal-find-scope" role="group" aria-label={tg('d19.scope')}>
                {(['terminal', 'blocks'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`terminal-find-opt${findScope === s ? ' is-on' : ''}`}
                    data-testid={`terminal-find-scope-${s}`}
                    aria-pressed={findScope === s}
                    title={tg(s === 'blocks' ? 'd19.blocksTip' : 'd19.terminalTip')}
                    onClick={() => {
                      findScopeRef.current(s)
                      findPosRef.current = null
                      findInputRef.current?.focus()
                    }}
                  >
                    {tg(s === 'blocks' ? 'd19.blocks' : 'd19.terminal')}
                  </button>
                ))}
              </span>
            ) : null}
            <input
              ref={findInputRef}
              className={(findScope === 'blocks' ? blocksMiss : findMiss) || findError ? 'is-miss' : ''}
              placeholder={tg(findScope === 'blocks' ? 'd19.placeholderBlocks' : 'find.placeholder')}
              aria-label={tg(findScope === 'blocks' ? 'd19.placeholderBlocks' : 'find.placeholder')}
              value={findQuery}
              onChange={(e) => {
                setFindQuery(e.target.value)
                findPosRef.current = null
                setFindMiss(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  runFind(e.shiftKey)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setFindOpen(false)
                  apiRef.current?.term.clearSelection()
                  apiRef.current?.term.focus()
                }
              }}
            />
            <span className="terminal-find-status" data-testid="terminal-find-hint">
              {findError ? tg('find.badRegex') : (findScope === 'blocks' ? blocksMiss : findMiss) ? tg('find.none') : !findQuery.trim() ? tg('find.hintShortcut') : ''}
            </span>
            {shownCount && shownCount.total > 0 && !findError ? (
              <span className="terminal-find-count" data-testid="terminal-find-count">
                {findScope === 'blocks' && shownCount.index < 1 ? tg('d19.blockCount', { n: shownCount.total }) : `${shownCount.index}/${shownCount.total}`}
              </span>
            ) : null}
            <button
              type="button"
              className={`terminal-find-opt${findCase ? ' is-on' : ''}`}
              data-testid="terminal-find-case"
              aria-pressed={findCase}
              title={tg('find.case')}
              aria-label={tg('find.case')}
              onClick={() => setFindCase((v) => !v)}
            >
              Aa
            </button>
            <button
              type="button"
              className={`terminal-find-opt${findRegex ? ' is-on' : ''}`}
              data-testid="terminal-find-regex"
              aria-pressed={findRegex}
              title={tg('find.regex')}
              aria-label={tg('find.regex')}
              onClick={() => setFindRegex((v) => !v)}
            >
              .*
            </button>
            <button type="button" title={tg('find.prev')} aria-label={tg('find.prev')} onClick={() => runFind(true)}>
              ↑
            </button>
            <button type="button" title={tg('find.next')} aria-label={tg('find.next')} onClick={() => runFind(false)}>
              ↓
            </button>
            <button
              type="button"
              title={tg('find.close')}
              aria-label={tg('find.close')}
              onClick={() => {
                setFindOpen(false)
                apiRef.current?.term.focus()
              }}
            >
              ×
            </button>
          </div>
        ) : null}
      </div>

    </>
  )
}
