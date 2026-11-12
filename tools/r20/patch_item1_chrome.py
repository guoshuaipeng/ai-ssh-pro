# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- App.tsx open panel for aiMemoryEvidence ---
app = ROOT / "src/renderer/src/App.tsx"
at = app.read_text(encoding="utf-8")
if "aiMemoryEvidence" not in at:
    old = "        detail.op === 'aiAuditFocus'\n      ) {"
    new = "        detail.op === 'aiAuditFocus' ||\n        detail.op === 'aiMemoryEvidence'\n      ) {"
    if old not in at:
        raise SystemExit("App open-panel list anchor not found")
    app.write_text(at.replace(old, new, 1), encoding="utf-8")
    print("App.tsx open list patched")
else:
    print("App.tsx already")

# --- screenshot-hooks type ---
hooks = ROOT / "src/renderer/src/lib/screenshot-hooks.ts"
ht = hooks.read_text(encoding="utf-8")
if "aiMemoryEvidence" not in ht:
    old = """  /** Round 18: AI card highlighted as if arrived from audit row. */
  | { op: "aiAuditFocus"; auditId?: string; command?: string }
"""
    new = old + """  /** Round 20: working-memory / observational evidence chip (honest, capped). */
  | { op: "aiMemoryEvidence"; goal?: string; hostFacts?: string[]; observations?: string[]; recentCommands?: string[] }
"""
    if old not in ht:
        raise SystemExit("hooks anchor not found")
    hooks.write_text(ht.replace(old, new, 1), encoding="utf-8")
    print("screenshot-hooks patched")
else:
    print("hooks already")

# --- CSS ---
css_path = ROOT / "src/renderer/src/styles.css"
css = css_path.read_text(encoding="utf-8")
block = """
/* R20 Round20: working-memory / observational evidence (honest, not a dump) */
.ai-panel .ai-memory-wrap {
  position: relative;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 42%;
}
.ai-panel .ai-memory-chip {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: 0 var(--space-1);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--fs-xs);
  line-height: 1.3;
  cursor: pointer;
}
.ai-panel .ai-memory-chip:hover,
.ai-panel .ai-memory-chip.is-open,
.ai-panel .ai-memory-chip:focus-visible {
  color: var(--color-text);
  background: var(--color-fill-muted);
  outline: none;
}
.ai-panel .ai-memory-chip-label {
  flex: 0 0 auto;
  white-space: nowrap;
}
.ai-panel .ai-memory-chip-count {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-panel .ai-memory-pop {
  min-width: 200px;
  max-width: min(320px, 90vw);
  padding: var(--space-2);
  z-index: 40;
}
.ai-panel .ai-memory-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.ai-panel .ai-memory-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2);
  align-items: baseline;
  font-size: var(--fs-xs);
  line-height: 1.35;
  color: var(--color-text);
}
.ai-panel .ai-memory-kind {
  color: var(--color-text-muted);
  white-space: nowrap;
}
.ai-panel .ai-memory-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 100%;
    flex-basis: 100%;
  }
}
"""
if "R20 Round20: working-memory" not in css:
    # place after working-goal panel rules
    anchor = ".ai-panel .ai-working-goal-text {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}"
    if anchor not in css:
        # append near end of file before last lines
        css = css + "\n" + block
        print("CSS appended at end")
    else:
        css = css.replace(anchor, anchor + "\n" + block, 1)
        print("CSS inserted after working-goal")
    css_path.write_text(css, encoding="utf-8")
else:
    print("CSS already")

print("panel chrome done")
