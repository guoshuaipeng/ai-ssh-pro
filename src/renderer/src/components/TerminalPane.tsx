import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalPrefs } from '@shared/ipc'
import { TERMINAL_PREFS_DEFAULTS } from '@shared/ipc'
import { AISS_INJECT_TERMINAL_EVENT } from '../lib/terminal-inject'
import { getXtermTheme } from '../lib/terminal-themes'
import { attachZmodem, type ZmodemAttach } from '../lib/zmodem-attach'

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
}

/** Electron 中 xterm 会把 Ctrl+C / Ctrl+V 当控制字符发给 SSH；此处对接系统剪贴板。 */
function attachTerminalClipboardKeys(term: Terminal): void {
  term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
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
  broadcastRef
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<{ term: Terminal; fit: FitAddon } | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const mirrorOnlyRef = useRef(mirrorOnly)
  mirrorOnlyRef.current = mirrorOnly
  const onUserDataRef = useRef(onUserData)
  onUserDataRef.current = onUserData
  const prefsRef = useRef(resolvePrefs(prefs))
  prefsRef.current = resolvePrefs(prefs)
  const [termMenu, setTermMenu] = useState<{ x: number; y: number } | null>(null)
  const [zmodemStatus, setZmodemStatus] = useState<string | null>(null)
  const termMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!termMenu) return
    const close = (e: MouseEvent) => {
      if (termMenuRef.current?.contains(e.target as Node)) return
      setTermMenu(null)
    }
    window.addEventListener('mousedown', close, true)
    return () => window.removeEventListener('mousedown', close, true)
  }, [termMenu])

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
    attachTerminalClipboardKeys(term)
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

    const unsubData = window.aiss.ssh.onData((p) => {
      if (p.sessionId !== sessionId) return
      const u8 = toUint8(p.chunk)
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
    })

    const writeInput = (data: string) => {
      if (onUserDataRef.current) {
        onUserDataRef.current(data)
        return
      }
      void window.aiss.ssh.write(sessionId, data)
    }

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
      ev.preventDefault()
      setTermMenu({ x: ev.clientX, y: ev.clientY })
    }
    el.addEventListener('mouseup', onMouseUp)
    el.addEventListener('contextmenu', onContextMenu)

    return () => {
      zm?.dispose()
      if (broadcastRef && broadcastRef.current === writeInput) {
        broadcastRef.current = null
      }
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('contextmenu', onContextMenu)
      ro.disconnect()
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
        <div ref={wrapRef} className="terminal-pane-xterm" title="选中后松开鼠标自动复制；右键可复制/粘贴" />
        {zmodemStatus ? <div className="zmodem-status">{zmodemStatus}</div> : null}
      </div>
      {termMenu ? (
        <div
          ref={termMenuRef}
          className="session-context-menu"
          style={{ left: termMenu.x, top: termMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="session-context-menu-item"
            onClick={() => {
              const t = apiRef.current?.term
              if (t?.hasSelection()) void navigator.clipboard.writeText(t.getSelection())
              setTermMenu(null)
            }}
          >
            复制
          </button>
          <button
            type="button"
            className="session-context-menu-item"
            disabled={mirrorOnly}
            onClick={() => {
              void navigator.clipboard.readText().then((text) => {
                if (text) apiRef.current?.term.paste(text)
              })
              setTermMenu(null)
            }}
          >
            粘贴
          </button>
        </div>
      ) : null}
    </>
  )
}
