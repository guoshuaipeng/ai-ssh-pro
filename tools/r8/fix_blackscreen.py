from pathlib import Path

# --- tauri-bridge: add missing ai.* APIs ---
p = Path("src/renderer/src/tauri-bridge.ts")
t = p.read_text(encoding="utf-8")
needle = """      resolveConfirm: (requestId: string, ok: boolean) =>
        invoke('ai_resolve_confirm', { requestId, ok }),
      getChatHistory: async (key: string) => {"""
insert = """      resolveConfirm: (requestId: string, ok: boolean) =>
        invoke('ai_resolve_confirm', { requestId, ok }),
      /** Electron alias used by AIPanel confirm buttons */
      confirmStep: (requestId: string, ok: boolean) =>
        invoke('ai_resolve_confirm', { requestId, ok }),
      /** Electron alias — parse SSH paste into form fields */
      parseSshForm: (rawText: string) => invoke('ai_parse_ssh', { text: rawText }),
      /** Protection registry (Electron); Tauri no-ops until wired */
      setSessionProtection: (_sessionId: string, _protection: unknown) => {},
      /** Working-memory goal for AI panel header (Electron ai:workingMemory:get) */
      getWorkingMemory: async (key: string) => {
        try {
          const row = await invoke<any>('core_memory_get', { sessionKey: key })
          const goal = row?.workingMemory?.goal
          return typeof goal === 'string' && goal.trim() ? goal : null
        } catch {
          return null
        }
      },
      getChatHistory: async (key: string) => {"""
if needle not in t:
    raise SystemExit("bridge needle missing")
if "getWorkingMemory:" in t and "ai:workingMemory:get" in t:
    print("already patched?")
else:
    t = t.replace(needle, insert, 1)
    p.write_text(t, encoding="utf-8")
    print("bridge patched")

# --- AIPanel harden ---
ap = Path("src/renderer/src/components/AIPanel.tsx")
at = ap.read_text(encoding="utf-8")
old = """  const refreshWorkingGoal = useCallback((key: string | null) => {
    if (!key) {
      setWorkingGoal(null)
      return
    }
    void window.aiss.ai.getWorkingMemory(key).then((goal) => {
      if (persistKeyRef.current !== key) return
      setWorkingGoal(visibleWorkingGoal(goal))
    })
  }, [])"""
new = """  const refreshWorkingGoal = useCallback((key: string | null) => {
    if (!key) {
      setWorkingGoal(null)
      return
    }
    const getter = window.aiss?.ai?.getWorkingMemory
    if (typeof getter !== 'function') {
      setWorkingGoal(null)
      return
    }
    void Promise.resolve(getter(key))
      .then((goal) => {
        if (persistKeyRef.current !== key) return
        setWorkingGoal(visibleWorkingGoal(goal))
      })
      .catch(() => {
        if (persistKeyRef.current === key) setWorkingGoal(null)
      })
  }, [])"""
if old not in at:
    raise SystemExit("AIPanel refreshWorkingGoal block missing")
ap.write_text(at.replace(old, new, 1), encoding="utf-8")
print("AIPanel hardened")

# --- ErrorBoundary in main.tauri.tsx ---
mt = Path("src/renderer/src/main.tauri.tsx")
m = mt.read_text(encoding="utf-8")
if "class ErrorBoundary" not in m:
    m = m.replace(
        "function AppGate(): React.ReactElement {",
        """class ErrorBoundary extends React.Component<
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

function AppGate(): React.ReactElement {"""
    )
    m = m.replace(
        "return <App />",
        "return (\n    <ErrorBoundary>\n      <App />\n    </ErrorBoundary>\n  )",
        1,
    )
    mt.write_text(m, encoding="utf-8")
    print("ErrorBoundary added")
else:
    print("ErrorBoundary already present")
