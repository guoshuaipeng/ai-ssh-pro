from pathlib import Path

p = Path('src/renderer/src/App.tsx')
t = p.read_text(encoding='utf-8')

# Update import
old_imp = "import { OPEN_AUDIT_EVENT } from './components/ExecReplay'"
new_imp = "import { OPEN_AUDIT_EVENT, OPEN_AI_FROM_AUDIT_EVENT, type OpenAiFromAuditDetail } from './components/ExecReplay'"
if old_imp not in t:
    raise SystemExit('import OPEN_AUDIT_EVENT not found')
if 'OPEN_AI_FROM_AUDIT_EVENT' not in t:
    t = t.replace(old_imp, new_imp, 1)

# Add state near aiFocusPendingToken
old_state = "  const [aiFocusPendingToken, setAiFocusPendingToken] = useState(0)\n"
new_state = """  const [aiFocusPendingToken, setAiFocusPendingToken] = useState(0)
  /** Round 17: focus an AI exec/command card after jumping from audit. */
  const [aiFocusExecToken, setAiFocusExecToken] = useState(0)
  const [aiFocusExec, setAiFocusExec] = useState<OpenAiFromAuditDetail | null>(null)
"""
if 'aiFocusExecToken' not in t:
    if old_state not in t:
        raise SystemExit('aiFocusPendingToken state not found')
    t = t.replace(old_state, new_state, 1)

# Add listener after OPEN_AUDIT_EVENT effect
marker = """  }, [openAudit])

  const openM2 = useCallback((view: TabView, title: string, extra?: Partial<Tab>) => {"""

listener = """  }, [openAudit])

  // Round 17: jump from audit row → AI dialog (inverse of 2.3)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = ((e as CustomEvent<OpenAiFromAuditDetail>).detail || {}) as OpenAiFromAuditDetail
      const host = (d.host || '').trim()
      if (host) {
        const hit =
          convTabs.find((row) => {
            const c = convFor(row.tabId)
            return c && (c.label === host || c.hostLabel === host || host.startsWith(c.hostLabel))
          }) ||
          tabsRef.current.find((tab) => {
            if (tab.view && tab.view !== 'session') return false
            const label = tab.customTitle || tab.connectOpts?.label?.trim() || tab.connectOpts?.host || tab.title
            return label === host || host.startsWith(String(label || ''))
          })
        if (hit) {
          const tabId = 'tabId' in hit ? hit.tabId : (hit as { tabId: string }).tabId
          setActiveTabId(tabId)
        }
      }
      ensureAiVisible()
      openRightPanelRef.current('ai')
      setAiFocusExec({
        id: d.id,
        host: d.host,
        text: d.text,
        tabNo: d.tabNo
      })
      setAiFocusExecToken((n) => n + 1)
    }
    window.addEventListener(OPEN_AI_FROM_AUDIT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AI_FROM_AUDIT_EVENT, onOpen)
  }, [convTabs, convFor, ensureAiVisible])

  const openM2 = useCallback((view: TabView, title: string, extra?: Partial<Tab>) => {"""

# Problem: ensureAiVisible is defined later. Need to place listener after ensureAiVisible.
# Find a better insertion point — near the OPEN_AUDIT listener is early; ensureAiVisible is around 7307.
# Use openRightPanelRef + updateLayout inline instead of ensureAiVisible to avoid order issues.

listener = """  }, [openAudit])

  // Round 17: jump from audit row → AI dialog (inverse of 2.3)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = ((e as CustomEvent<OpenAiFromAuditDetail>).detail || {}) as OpenAiFromAuditDetail
      const host = (d.host || '').trim()
      if (host) {
        const hitTab = tabsRef.current.find((tab) => {
          if (tab.view && tab.view !== 'session') return false
          const label =
            tab.customTitle ||
            (tab.profileId ? sessionStateRef.current.profiles.find((p) => p.id === tab.profileId)?.label : undefined) ||
            tab.connectOpts?.label?.trim() ||
            tab.connectOpts?.host ||
            tab.title
          if (!label) return false
          return label === host || host === label || host.startsWith(label) || host.includes(label)
        })
        // Prefer exact conversation label match (#n) via ordinals when available
        const byConv = convTabs.find((row) => {
          const c = convFor(row.tabId)
          return Boolean(c && (c.label === host || c.hostLabel === host))
        })
        const tabId = byConv?.tabId || hitTab?.tabId
        if (tabId) setActiveTabId(tabId)
      }
      updateLayout((p) => (p.showAi ? p : withPaneToggle(p, 'ai', true)))
      openRightPanelRef.current('ai')
      setAiFocusExec({
        id: d.id,
        host: d.host,
        text: d.text,
        tabNo: d.tabNo
      })
      setAiFocusExecToken((n) => n + 1)
    }
    window.addEventListener(OPEN_AI_FROM_AUDIT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AI_FROM_AUDIT_EVENT, onOpen)
  }, [convTabs, convFor, updateLayout])

  const openM2 = useCallback((view: TabView, title: string, extra?: Partial<Tab>) => {"""

if 'OPEN_AI_FROM_AUDIT_EVENT, onOpen' not in t and 'Round 17: jump from audit' not in t:
    if marker not in t:
        raise SystemExit('openM2 marker not found')
    t = t.replace(marker, listener, 1)

# Pass props to AIPanel
old_focus = '              focusPendingToken={aiFocusPendingToken}\n'
new_focus = """              focusPendingToken={aiFocusPendingToken}
              focusExecToken={aiFocusExecToken}
              focusExec={aiFocusExec}
"""
if 'focusExecToken=' not in t:
    if old_focus not in t:
        raise SystemExit('focusPendingToken prop not found')
    t = t.replace(old_focus, new_focus, 1)

p.write_text(t, encoding='utf-8')
print('App ok')
