import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { AISS_INJECT_TERMINAL_EVENT } from '../lib/terminal-inject'

type Props = {
  sessionId: string
  active: boolean
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

export default function TerminalPane({ sessionId, active }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<{ term: Terminal; fit: FitAddon } | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const [termMenu, setTermMenu] = useState<{ x: number; y: number } | null>(null)
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

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Cascadia Code, Consolas, "Courier New", monospace',
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    attachTerminalClipboardKeys(term)
    apiRef.current = { term, fit }

    const unsubData = window.aiss.ssh.onData((p) => {
      if (p.sessionId === sessionId) term.write(p.chunk)
    })

    const subInput = term.onData((data) => {
      void window.aiss.ssh.write(sessionId, data)
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
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('contextmenu', onContextMenu)
      ro.disconnect()
      subInput.dispose()
      unsubData()
      term.dispose()
      apiRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    const onInject = (e: Event) => {
      const ce = e as CustomEvent<{ sessionId?: string; text?: string; execute?: boolean }>
      if (ce.detail?.sessionId !== sessionId) return
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
      <div ref={wrapRef} style={{ width: '100%', height: '100%' }} title="选中后松开鼠标自动复制；右键可复制/粘贴" />
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
