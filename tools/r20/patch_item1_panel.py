# -*- coding: utf-8 -*-
"""Round 20 item 1: memory evidence visibility in AIPanel."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
panel = panel_path.read_text(encoding="utf-8")

# 1) import
old_imp = "import { visibleWorkingGoal } from '@shared/working-memory-view'"
new_imp = "import { buildMemoryEvidenceView, visibleWorkingGoal, type MemoryEvidenceView } from '@shared/working-memory-view'"
if "buildMemoryEvidenceView" not in panel:
    if old_imp not in panel:
        raise SystemExit("import not found")
    panel = panel.replace(old_imp, new_imp, 1)
    print("import ok")
else:
    print("import already")

# 2) state
old_state = "  const [workingGoal, setWorkingGoal] = useState<string | null>(null)"
new_state = (
    "  const [workingGoal, setWorkingGoal] = useState<string | null>(null)\n"
    "  const [memoryView, setMemoryView] = useState<MemoryEvidenceView | null>(null)\n"
    "  const [memoryOpen, setMemoryOpen] = useState(false)\n"
    "  const memoryRef = useRef<HTMLDivElement | null>(null)"
)
if "memoryView" not in panel:
    if old_state not in panel:
        raise SystemExit("workingGoal state not found")
    panel = panel.replace(old_state, new_state, 1)
    print("state ok")
else:
    print("state already")

# 3) refreshWorkingGoal -> also snapshot
old_refresh = """  const refreshWorkingGoal = useCallback((key: string | null) => {
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
  }, [])
"""

new_refresh = """  const refreshWorkingGoal = useCallback((key: string | null) => {
    if (!key) {
      setWorkingGoal(null)
      setMemoryView(null)
      setMemoryOpen(false)
      return
    }
    const snapFn = window.aiss?.ai?.getMemorySnapshot
    const goalFn = window.aiss?.ai?.getWorkingMemory
    const applyView = (raw: {
      goal?: string | null
      hostFacts?: string[]
      observations?: string[]
      recentCommands?: string[]
    } | null) => {
      if (persistKeyRef.current !== key) return
      const view = buildMemoryEvidenceView(raw ?? {})
      setWorkingGoal(view.goal)
      setMemoryView(view.count > 0 ? view : view.goal ? view : null)
      if (!(view.count > 0)) setMemoryOpen(false)
    }
    if (typeof snapFn === 'function') {
      void Promise.resolve(snapFn(key))
        .then((snap) => applyView(snap))
        .catch(() => {
          if (typeof goalFn === 'function') {
            void Promise.resolve(goalFn(key))
              .then((goal) => applyView({ goal }))
              .catch(() => {
                if (persistKeyRef.current === key) {
                  setWorkingGoal(null)
                  setMemoryView(null)
                }
              })
          } else if (persistKeyRef.current === key) {
            setWorkingGoal(null)
            setMemoryView(null)
          }
        })
      return
    }
    if (typeof goalFn !== 'function') {
      setWorkingGoal(null)
      setMemoryView(null)
      return
    }
    void Promise.resolve(goalFn(key))
      .then((goal) => applyView({ goal }))
      .catch(() => {
        if (persistKeyRef.current === key) {
          setWorkingGoal(null)
          setMemoryView(null)
        }
      })
  }, [])
"""

if "getMemorySnapshot" not in panel or "buildMemoryEvidenceView(raw" not in panel:
    if old_refresh not in panel:
        raise SystemExit("refreshWorkingGoal block not found")
    panel = panel.replace(old_refresh, new_refresh, 1)
    print("refresh ok")
else:
    print("refresh already")

# 4) close memory pop on outside click — piggyback safetyOpen effect or add small effect near memory
# Add after safetyOpen focus effect is complex; instead close when memoryOpen and mousedown outside in a dedicated effect.
mem_effect = """
  useEffect(() => {
    if (!memoryOpen) return
    const close = (e: MouseEvent) => {
      if (memoryRef.current?.contains(e.target as Node)) return
      setMemoryOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMemoryOpen(false)
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', esc, true)
    }
  }, [memoryOpen])
"""
if "memoryRef.current?.contains" not in panel:
    # insert after refreshWorkingGoal effect on persistKey
    anchor = """  useEffect(() => {
    refreshWorkingGoal(persistKey)
  }, [persistKey, refreshWorkingGoal])
"""
    if anchor not in panel:
        raise SystemExit("persistKey refresh effect not found")
    panel = panel.replace(anchor, anchor + mem_effect, 1)
    print("memory close effect ok")
else:
    print("memory close effect already")

# 5) UI chip after workingGoal
old_ui = """            {workingGoal ? (
              <span className="ai-working-goal" title={workingGoal} data-testid="ai-working-goal">
                <span className="ai-working-goal-label">{tg('wm.goal')}</span>
                <span className="ai-working-goal-text">{workingGoal}</span>
              </span>
            ) : null}
            {targetOpen ? (
"""

new_ui = """            {workingGoal ? (
              <span className="ai-working-goal" title={workingGoal} data-testid="ai-working-goal">
                <span className="ai-working-goal-label">{tg('wm.goal')}</span>
                <span className="ai-working-goal-text">{workingGoal}</span>
              </span>
            ) : null}
            {memoryView && memoryView.count > 0 ? (
              <div className="ai-memory-wrap" ref={memoryRef} data-testid="ai-memory-wrap">
                <button
                  type="button"
                  className={`ai-memory-chip${memoryOpen ? ' is-open' : ''}`}
                  data-testid="ai-memory-chip"
                  aria-expanded={memoryOpen}
                  aria-controls="ai-memory-pop"
                  title={memoryView.summaryLine || tg('wm.memoryTitle')}
                  onClick={() => setMemoryOpen((v) => !v)}
                >
                  <span className="ai-memory-chip-label">{tg('wm.memory')}</span>
                  <span className="ai-memory-chip-count" data-testid="ai-memory-count">
                    · {memoryView.count}
                  </span>
                </button>
                {memoryOpen ? (
                  <div
                    id="ai-memory-pop"
                    className="titlebar-popover ai-memory-pop"
                    role="dialog"
                    data-testid="ai-memory-pop"
                    aria-label={tg('wm.memoryTitle')}
                  >
                    <div className="ai-pop-head">{tg('wm.memoryTitle')}</div>
                    <ul className="ai-memory-list" data-testid="ai-memory-list">
                      {memoryView.items.map((it, idx) => (
                        <li key={`${it.kind}-${idx}`} className="ai-memory-item" data-kind={it.kind} title={it.text}>
                          <span className="ai-memory-kind">
                            {it.kind === 'hostFact'
                              ? tg('wm.hostFact')
                              : it.kind === 'observation'
                                ? tg('wm.observation')
                                : tg('wm.recentCommand')}
                          </span>
                          <span className="ai-memory-text">{it.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            {targetOpen ? (
"""

if 'data-testid="ai-memory-chip"' not in panel:
    if old_ui not in panel:
        raise SystemExit("workingGoal UI block not found")
    panel = panel.replace(old_ui, new_ui, 1)
    print("UI ok")
else:
    print("UI already")

# 6) clear memory on new chat paths that clear workingGoal
# setWorkingGoal(null) sites — also clear memoryView when wiping chat
# Be careful not to break every setWorkingGoal; refreshWorkingGoal already handles.
# When setWorkingGoal(null) is called alone before refresh, also clear memoryView.
panel = panel.replace(
    "      setWorkingGoal(null)\n      if (persistKey) {\n        refreshWorkingGoal(persistKey)\n",
    "      setWorkingGoal(null)\n      setMemoryView(null)\n      setMemoryOpen(false)\n      if (persistKey) {\n        refreshWorkingGoal(persistKey)\n",
)
# two similar blocks for archive/clear — count occurrences
# softer: ensure setWorkingGoal(null) near clear also resets memory when followed by refresh
count_null = panel.count("setWorkingGoal(null)")
print(f"setWorkingGoal(null) count={count_null}")

# 7) screenshot op aiMemoryEvidence — seed snapshot into panel state
# Add to the shot op list and handler
if "aiMemoryEvidence" not in panel:
    panel = panel.replace(
        "detail?.op === 'aiAuditFocus'\n      ) {",
        "detail?.op === 'aiAuditFocus' ||\n        detail?.op === 'aiMemoryEvidence'\n      ) {",
        1,
    )
    # insert handler before aiComposerPop check
    marker = "      if (detail?.op !== 'aiComposerPop') {"
    handler = """      if (detail?.op === 'aiMemoryEvidence') {
        screenshotForceKeyRef.current = true
        setHasApiKey(true)
        const d = detail as {
          goal?: string
          hostFacts?: string[]
          observations?: string[]
          recentCommands?: string[]
        }
        const view = buildMemoryEvidenceView({
          goal: d.goal ?? '排查 nginx 502',
          hostFacts: d.hostFacts ?? ['web-01 / 10.0.0.8'],
          observations: d.observations ?? ['df：/ 使用 91%', 'nginx inactive (dead)'],
          recentCommands: d.recentCommands ?? ['systemctl status nginx --no-pager']
        })
        setWorkingGoal(view.goal)
        setMemoryView(view)
        setMemoryOpen(true)
        return
      }
"""
    if marker not in panel:
        raise SystemExit("aiComposerPop marker not found for memory shot")
    panel = panel.replace(marker, handler + marker, 1)
    print("screenshot op ok")
else:
    print("screenshot op already")

panel_path.write_text(panel, encoding="utf-8")
print("AIPanel written")
