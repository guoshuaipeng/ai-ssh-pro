import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AiDebugWindowApp from './components/AiDebugWindowApp'
import { applyUiTheme, loadUiThemeId } from './lib/ui-themes'
import { I18nProvider } from './lib/i18n'
import { installTauriBridge } from './tauri-bridge'
import './fonts-system.css'
import './styles.css'
import './features.css'
import './styles-m2.css'

try {
  applyUiTheme(loadUiThemeId())
} catch {
  /* ignore */
}

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

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[renderer] ErrorBoundary', error, info)
  }
  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error)
      return (
        <div style={{ padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif', maxWidth: 640 }}>
          <h1 style={{ fontSize: 16, margin: '0 0 12px' }}>界面渲染出错</h1>
          <p style={{ margin: '0 0 12px', opacity: 0.85, lineHeight: 1.5 }}>
            主界面被错误打断。可尝试关闭 AI 面板相关状态后重启；下方为错误信息。
          </p>
          <pre style={{ margin: 0, padding: 12, background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', color: '#f85149' }}>
            {msg}
          </pre>
          <p style={{ marginTop: 16 }}>
            <button type="button" onClick={() => this.setState({ error: null })} style={{ padding: '8px 12px' }}>
              重试渲染
            </button>
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

function AppGate(): React.ReactElement {
  const api = (window as unknown as { aiss?: unknown }).aiss
  const [diag, setDiag] = useState('')

  useEffect(() => {
    const ua = navigator.userAgent
    const plat = /Mac/i.test(ua) ? 'darwin' : /Win/i.test(ua) ? 'win32' : 'linux'
    document.body.classList.add(`platform-${plat}`)
    const w = window as unknown as { aiss?: unknown }
    const href = typeof window !== 'undefined' ? window.location.href : ''
    const line = `[renderer] mount: window.aiss = ${w.aiss === undefined ? 'undefined' : typeof w.aiss}`
    console.warn(line)
    setDiag(`${line}\n页面 URL: ${href}`)
    if (w.aiss) applyUiTheme(loadUiThemeId())
  }, [])

  if (!api) {
    return (
      <div style={{ padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif', maxWidth: 560 }}>
        <h1 style={{ fontSize: 16, margin: '0 0 12px' }}>主进程桥接未加载</h1>
        <p style={{ margin: '0 0 16px', opacity: 0.85, lineHeight: 1.5 }}>
          Tauri bridge 未安装（window.aiss 不存在）。
        </p>
        {diag && (
          <pre style={{ margin: 0, padding: 12, background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', color: '#8b949e' }}>
            {diag}
          </pre>
        )}
      </div>
    )
  }
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}

function DebugWindowGate(): React.ReactElement {
  const api = (window as unknown as { aiss?: unknown }).aiss
  if (!api) {
    return <div style={{ padding: 24, color: '#e6edf3' }}>调试窗口：桥接未加载</div>
  }
  return <AiDebugWindowApp />
}

async function boot() {
  await installTauriBridge()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <I18nProvider>{isDebugWindow() ? <DebugWindowGate /> : <AppGate />}</I18nProvider>
    </React.StrictMode>
  )
}

void boot()
