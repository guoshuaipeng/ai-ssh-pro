import { useCallback, useEffect, useState } from 'react'
import type { AppDialogKind } from '@shared/ipc'
import TerminalPane from './components/TerminalPane'
import AIPanel from './components/AIPanel'
import AppToolbar from './components/AppToolbar'
import AiConfigModal from './components/AiConfigModal'
import ConnectionConfigModal from './components/ConnectionConfigModal'
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
  const [dialog, setDialog] = useState<AppDialogKind | null>(null)
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

  const [smartPaste, setSmartPaste] = useState('')
  const [aiParsing, setAiParsing] = useState(false)
  const [parseNotes, setParseNotes] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null
  const activeSessionId = activeTab?.sessionId ?? null

  useEffect(() => {
    void window.aiss.sessions.list().then(setSaved)
  }, [])

  useEffect(() => {
    return window.aiss.app.onOpenDialog((kind) => setDialog(kind))
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

  const openSession = useCallback(async (opts: SshConnectOptions): Promise<boolean> => {
    setError(null)
    setConnecting(true)
    try {
      const { sessionId, meta } = await window.aiss.ssh.connect(opts)
      const title = meta.label ?? `${meta.username}@${meta.host}`
      const tabId = uuid()
      setTabs((prev) => [...prev, { tabId, sessionId, title }])
      setActiveTabId(tabId)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setConnecting(false)
    }
  }, [])

  const connectFromForm = useCallback(async () => {
    const p = Number(port) || 22
    const ok = await openSession({
      host: host.trim(),
      port: p,
      username: username.trim(),
      password: password || undefined,
      privateKeyPath: privateKeyPath.trim() || undefined,
      passphrase: passphrase || undefined,
      label: label.trim() || undefined
    })
    if (ok) setDialog(null)
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

  const parseAndFillForm = useCallback(async () => {
    setError(null)
    setParseNotes(null)
    const blob = smartPaste.trim()
    if (!blob) return
    setAiParsing(true)
    try {
      const p = await window.aiss.ai.parseSshForm(blob)
      if (p.label != null && p.label !== '') setLabel(p.label)
      if (p.host != null && p.host !== '') setHost(p.host)
      if (p.port != null && Number.isFinite(p.port)) setPort(String(p.port))
      if (p.username != null && p.username !== '') setUsername(p.username)
      if (p.password != null) setPassword(p.password)
      if (p.privateKeyPath != null) setPrivateKeyPath(p.privateKeyPath)
      if (p.passphrase != null) setPassphrase(p.passphrase)
      setParseNotes(p.notes ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAiParsing(false)
    }
  }, [smartPaste])

  return (
    <div className="app-root">
      <AppToolbar onOpenConnection={() => setDialog('connection')} onOpenAi={() => setDialog('ai')} />

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-scroll">
            <div style={{ marginBottom: 12 }}>
              <button type="button" className="primary" style={{ width: '100%' }} onClick={() => setDialog('connection')}>
                打开连接配置
              </button>
              <button
                type="button"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => setDialog('ai')}
              >
                打开 AI 配置
              </button>
            </div>

            <h3>已保存会话</h3>
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

      <ConnectionConfigModal
        open={dialog === 'connection'}
        onClose={() => setDialog(null)}
        error={error}
        host={host}
        setHost={setHost}
        port={port}
        setPort={setPort}
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        privateKeyPath={privateKeyPath}
        setPrivateKeyPath={setPrivateKeyPath}
        passphrase={passphrase}
        setPassphrase={setPassphrase}
        label={label}
        setLabel={setLabel}
        smartPaste={smartPaste}
        setSmartPaste={setSmartPaste}
        parseNotes={parseNotes}
        aiParsing={aiParsing}
        connecting={connecting}
        onParseAndFill={parseAndFillForm}
        onConnect={connectFromForm}
        onSaveProfile={saveProfile}
      />

      <AiConfigModal open={dialog === 'ai'} onClose={() => setDialog(null)} />
    </div>
  )
}
