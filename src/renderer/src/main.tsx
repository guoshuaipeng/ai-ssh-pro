import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

function AppGate(): React.ReactElement {
  const api = (window as unknown as { aiss?: unknown }).aiss
  if (!api) {
    return (
      <div style={{ padding: 24, color: '#e6edf3', fontFamily: 'system-ui, sans-serif', maxWidth: 480 }}>
        <h1 style={{ fontSize: 16, margin: '0 0 12px' }}>主进程桥接未加载</h1>
        <p style={{ margin: 0, opacity: 0.85, lineHeight: 1.5 }}>
          preload 未执行（<code style={{ color: '#58a6ff' }}>window.aiss</code> 不存在）。请完全退出应用后重新执行{' '}
          <code style={{ color: '#58a6ff' }}>npm run dev</code>。
        </p>
      </div>
    )
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppGate />
  </React.StrictMode>
)
