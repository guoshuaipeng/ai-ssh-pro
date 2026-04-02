import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { AISS_INJECT_TERMINAL_EVENT } from '../lib/terminal-inject'

type Props = {
  sessionId: string
  active: boolean
}

export default function TerminalPane({ sessionId, active }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<{ term: Terminal; fit: FitAddon } | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active

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

    return () => {
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

  return <div ref={wrapRef} style={{ width: '100%', height: '100%' }} />
}
