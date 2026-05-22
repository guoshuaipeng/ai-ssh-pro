import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AiDebugWindowApp from './components/AiDebugWindowApp'
import './styles.css'

function isDebugWindow(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('ai-debug') === '1') return true
  } catch {
    /* ignore */
  }
  return window.location.hash === '#debug'
}

function AppGate(): React.ReactElement {
  const api = (window as unknown as { aiss?: unknown }).aiss
  const [diag, setDiag] = useState('')

  useEffect(() => {
    const w = window as unknown as { aiss?: unknown }
    const href = typeof window !== 'undefined' ? window.location.href : ''
    const line = `[renderer] mount: window.aiss = ${w.aiss === undefined ? 'undefined' : typeof w.aiss}`
    console.warn(line)
    setDiag(`${line}\n页面 URL: ${href}\n\n请查看运行「npm run dev」或调试启动的终端里以 [main] / [preload] 开头的日志。`)
  }, [])

  if (!api) {
    return (
      <div style={{ padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif', maxWidth: 560 }}>
        <h1 style={{ fontSize: 16, margin: '0 0 12px' }}>主进程桥接未加载</h1>
        <p style={{ margin: '0 0 16px', opacity: 0.85, lineHeight: 1.5 }}>
          preload 未执行（<code style={{ color: '#58a6ff' }}>window.aiss</code> 不存在）。请先完全退出应用再执行{' '}
          <code style={{ color: '#58a6ff' }}>npm run dev</code>，并查看<strong>终端诊断输出</strong>。
        </p>
        {diag && (
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: '#8b949e'
            }}
          >
            {diag}
          </pre>
        )}
      </div>
    )
  }
  return <App />
}

function DebugWindowGate(): React.ReactElement {
  const api = (window as unknown as { aiss?: unknown }).aiss
  const [diag, setDiag] = useState('')

  useEffect(() => {
    const w = window as unknown as { aiss?: unknown }
    const href = typeof window !== 'undefined' ? window.location.href : ''
    const line = `[renderer] debug window: window.aiss = ${w.aiss === undefined ? 'undefined' : typeof w.aiss}`
    console.warn(line)
    setDiag(`${line}\n页面 URL: ${href}`)
  }, [])

  if (!api) {
    return (
      <div style={{ padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif', maxWidth: 560 }}>
        <h1 style={{ fontSize: 16, margin: '0 0 12px' }}>调试窗口：主进程桥接未加载</h1>
        <p style={{ margin: '0 0 16px', opacity: 0.85, lineHeight: 1.5 }}>
          请完全退出应用后重新执行 <code style={{ color: '#58a6ff' }}>npm run dev</code>。
        </p>
        {diag && (
          <pre
            style={{
              margin: 0,
              padding: 12,
              background: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: '#8b949e'
            }}
          >
            {diag}
          </pre>
        )}
      </div>
    )
  }
  return <AiDebugWindowApp />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isDebugWindow() ? <DebugWindowGate /> : <AppGate />}</React.StrictMode>
)
