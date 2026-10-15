import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { tg } from '../lib/i18n'
import Icon from './Icon'
import { openContextMenu, type ContextMenuItem } from './ContextMenu'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPrefs } from '@shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '@shared/ipc'
import { AISS_INJECT_TERMINAL_EVENT } from '../lib/terminal-inject'
import { getXtermTheme } from '../lib/terminal-themes'
import { attachZmodem, type ZmodemAttach } from '../lib/zmodem-attach'
import { findInBuffer, AISS_TERMINAL_FIND_EVENT } from '../lib/terminal-find'
import { looksLikeError, rememberError, requestAiExplain } from '../lib/ai-events'
import { extractPromptCommand, ghostSuffix, rankSuggestions, terminalKeyAction } from '@shared/smart-complete'
import { loadSmartHistory, loadSmartPrefs, seedDemoHistory } from '../lib/smart-history'
import { isDemoSessionId } from '@shared/demo-host'
import { HISTORY_CHANGED_EVENT } from '../lib/workspace-events'

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
function attachTerminalClipboardKeys(term: Terminal, before?: (ev: KeyboardEvent) => boolean): void {
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
        if (text) term.paste(text)
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
  const [zmodemStatus, setZmodemStatus] = useState<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findMiss, setFindMiss] = useState(false)
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
    const onFind = () => {
      if (!activeRef.current) return
      setFindOpen(true)
      window.setTimeout(() => findInputRef.current?.select(), 0)
    }
    window.addEventListener(AISS_TERMINAL_FIND_EVENT, onFind)
    return () => window.removeEventListener(AISS_TERMINAL_FIND_EVENT, onFind)
  }, [])

  const runFind = (backwards: boolean) => {
    const term = apiRef.current?.term
    if (!term || !findQuery) return
    const buf = term.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '')
    const hit = findInBuffer(lines, findQuery, findPosRef.current, backwards)
    setFindMiss(!hit)
    if (!hit) return
    findPosRef.current = hit
    term.select(hit.col, hit.row, findQuery.length)
    term.scrollToLine(Math.max(0, hit.row - Math.floor(term.rows / 2)))
  }


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
    const writeInput = (data: string) => {
      if (inputBlockedRef.current) {
        onInputBlockedRef.current?.()
        return
      }
      if (onUserDataRef.current) {
        onUserDataRef.current(data)
        return
      }
      void window.aiss.ssh.write(sessionId, data)
    }
    attachTerminalClipboardKeys(term, (ev) => {
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
              if (text) apiRef.current?.term.paste(text)
            })
          }
        },
        {
          id: 'pasteRun',
          label: tg('ctx.pasteRun'),
          disabled: mirrorOnlyRef.current,
          onSelect: () => {
            void navigator.clipboard.readText().then((text) => {
              if (text) apiRef.current?.term.paste(text.endsWith('\r') || text.endsWith('\n') ? text : text + '\r')
            })
          }
        },
        'sep',
        {
          id: 'aiExplain',
          label: tg('a1.explainSelection'),
          onSelect: () => explainWithAi('selection')
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
      window.removeEventListener(HISTORY_CHANGED_EVENT, onHist)
      subInput.dispose()
      unsubData()
      term.dispose()
      apiRef.current = null
    }
  }, [sessionId, broadcastRef])

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
      <div className="terminal-pane-wrap">
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
        {findOpen ? (
          <div className="terminal-find-bar" role="search" data-testid="terminal-find">
            <input
              ref={findInputRef}
              className={findMiss ? 'is-miss' : ''}
              placeholder={tg('find.placeholder')}
              aria-label={tg('find.placeholder')}
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
            <span className="terminal-find-status">{findMiss ? tg('find.none') : ''}</span>
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
