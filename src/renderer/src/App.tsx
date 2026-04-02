import { useCallback, useEffect, useState } from 'react'
import TerminalPane from './components/TerminalPane'
import AIPanel from './components/AIPanel'
import type { SavedSessionProfile, SshConnectOptions } from '@shared/ipc'

type Tab = {
  tabId: string
  sessionId: string
  title: string
}

function uuid(): string {
  return crypto.randomUUID()
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedSessionProfile[]>([])

  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [privateKeyPath, setPrivateKeyPath] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [label, setLabel] = useState('')

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null
  const activeSessionId = activeTab?.sessionId ?? null

  useEffect(() => {
    void window.aiss.sessions.list().then(setSaved)
  }, [])

  useEffect(() => {
    return window.aiss.ssh.onStatus((st) => {
      if (st.status === 'error' && st.message) {
        setError(st.message)
      }
      if (st.status === 'closed') {
        setTabs((prev) => prev.filter((t) => t.sessionId !== st.sessionId))
      }
    })
  }, [])

  useEffect(() => {
    if (activeTabId && !tabs.some((t) => t.tabId === activeTabId)) {
      setActiveTabId(tabs[0]?.tabId ?? null)
    }
  }, [tabs, activeTabId])

  const persistSaved = useCallback(async (next: SavedSessionProfile[]) => {
    setSaved(next)
    await window.aiss.sessions.save(next)
  }, [])

  const openSession = useCallback(
    async (opts: SshConnectOptions) => {
      setError(null)
      setConnecting(true)
      try {
        const { sessionId, meta } = await window.aiss.ssh.connect(opts)
        const title = meta.label ?? `${meta.username}@${meta.host}`
        const tabId = uuid()
        setTabs((prev) => [...prev, { tabId, sessionId, title }])
        setActiveTabId(tabId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setConnecting(false)
      }
    },
    []
  )

  const connectFromForm = useCallback(() => {
    const p = Number(port) || 22
    void openSession({
      host: host.trim(),
      port: p,
      username: username.trim(),
      password: password || undefined,
      privateKeyPath: privateKeyPath.trim() || undefined,
      passphrase: passphrase || undefined,
      label: label.trim() || undefined
    })
  }, [host, label, openSession, passphrase, password, port, privateKeyPath, username])

  const closeTab = useCallback(
    (tabId: string, sessionId: string) => {
      void window.aiss.ssh.disconnect(sessionId)
      setTabs((prev) => prev.filter((t) => t.tabId !== tabId))
      setActiveTabId((cur) => (cur === tabId ? null : cur))
    },
    []
  )

  const saveProfile = useCallback(() => {
    if (!host.trim() || !username.trim()) {
      setError('保存前请填写主机与用户名')
      return
    }
    const p: SavedSessionProfile = {
      id: uuid(),
      label: label.trim() || `${username.trim()}@${host.trim()}`,
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      privateKeyPath: privateKeyPath.trim() || undefined
    }
    void persistSaved([...saved, p])
  }, [host, label, persistSaved, port, privateKeyPath, saved, username])

  const connectProfile = useCallback(
    (p: SavedSessionProfile) => {
      setHost(p.host)
      setPort(String(p.port))
      setUsername(p.username)
      setPrivateKeyPath(p.privateKeyPath ?? '')
      setLabel(p.label)
      void openSession({
        host: p.host,
        port: p.port,
        username: p.username,
        privateKeyPath: p.privateKeyPath,
        password: password || undefined,
        passphrase: passphrase || undefined,
        label: p.label
      })
    },
    [openSession, passphrase, password]
  )

  const removeProfile = useCallback(
    (id: string) => {
      void persistSaved(saved.filter((s) => s.id !== id))
    },
    [persistSaved, saved]
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <h3>新建连接</h3>
          {error && (
            <div style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 12 }}>{error}</div>
          )}
          <div className="field">
            <label>显示名</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="可选" />
          </div>
          <div className="field">
            <label>主机</label>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="172.19.161.225" />
          </div>
          <div className="field">
            <label>端口</label>
            <input value={port} onChange={(e) => setPort(e.target.value)} />
          </div>
          <div className="field">
            <label>用户名</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="与私钥二选一"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>私钥路径（本机）</label>
            <input
              value={privateKeyPath}
              onChange={(e) => setPrivateKeyPath(e.target.value)}
              placeholder="例如 C:\\Users\\me\\.ssh\\id_rsa"
            />
          </div>
          <div className="field">
            <label>私钥口令</label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button type="button" className="primary" disabled={connecting} onClick={() => void connectFromForm()}>
            {connecting ? '连接中…' : '连接'}
          </button>
          <button type="button" style={{ marginLeft: 8 }} onClick={() => void saveProfile()}>
            保存到列表
          </button>

          <h3 style={{ marginTop: 20 }}>已保存会话</h3>
          {saved.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 12 }}>暂无</div>}
          {saved.map((p) => (
            <div key={p.id} className="profile-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {p.username}@{p.host}:{p.port}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" onClick={() => connectProfile(p)}>
                  连接
                </button>
                <button type="button" onClick={() => removeProfile(p.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="main">
        <div className="tab-bar">
          {tabs.length === 0 && <span style={{ padding: '8px 12px', color: 'var(--muted)' }}>未打开会话</span>}
          {tabs.map((t) => (
            <button
              key={t.tabId}
              type="button"
              className={`tab ${t.tabId === activeTabId ? 'active' : ''}`}
              onClick={() => setActiveTabId(t.tabId)}
            >
              {t.title}
              <span
                role="presentation"
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.tabId, t.sessionId)
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>

        <div className="terminal-stack">
          {tabs.map((t) => (
            <div key={t.tabId} className={`terminal-layer ${t.tabId === activeTabId ? 'active' : ''}`}>
              <TerminalPane sessionId={t.sessionId} active={t.tabId === activeTabId} />
            </div>
          ))}
        </div>
      </section>

      <AIPanel activeSessionId={activeSessionId} />
    </div>
  )
}
