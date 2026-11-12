# -*- coding: utf-8 -*-
"""R33 item1: design note + toast message wrap + toast-action testid + guard test."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

design = ROOT / "docs/design/r33-full-page-visual-audit.md"
design.parent.mkdir(parents=True, exist_ok=True)
design.write_text("""# Round 33 design — full-page visual audit (AI dialog)

## UX review (before code)
- **Cadence**: every 3 rounds (last full-page: Round 30). Scope = AI panel chrome + R32 surfaces (miss→新开对话, EN Ask chip), not whole app / port-forward.
- **Pass**: code review of hierarchy / empty·error / host banners / memory·failure / deep-link miss / policy chip + harness wide/narrow × dark/light for new R32 states.
- **Main CTA**: miss toast action = 新开对话 / New chat; Agree still only confirm primary; failure pin still 「带证据重试」; chip short label ≠ Agree.
- **Binding**: new chat stays on current host/session key; chip/aria bind tab policy + source; locale shot must not leak into unrelated zh expects.
- **Empty/error**: miss toast ≠ filter-empty ≠ true-empty; model-missing still suppresses host banners (R31).

## Findings (from R14–R32 matrix + code)

| Pri | Finding | Disposition |
|-----|---------|-------------|
| P2 | R32 miss→新开对话 + EN Ask chip shipped without screenshot matrix | **R33**: `docs/screenshots/r33/` miss toast + EN chip (wide/narrow × dark/light) |
| P2 | Long miss toast copy + action: message `<span>` lacks `min-width: 0` → crush/overflow risk | **R33 quick fix**: toast message flex wrap; `data-testid=toast-action` |
| P2 | `test-r31-*` / `test-r32-*` not wired into `package.json` `test:parts` | **R33 polish**: wire R31–R33 |
| P2 | True-device Tauri wide/narrow × theme still oral debt (R6+) | Keep Electron declarative matrix; backlog |
| P3 | Pending Decline weight / policy pop title wrap | Accept |
| P3 | EN chip「Ask」vs conversational “ask” — intentional (R32; not Confirm CTA) | Accept; matrix documents Ask/Suggest/Auto |
| ok | Dual banner mutex; model-missing hides banners; miss→startNewChat; chip shorts zh/en | R29–R32 |

## Item 1 — audit backlog + toast wrap (quick P2)
- Append Round 33 full-page table to `docs/backlog.md`.
- CSS after toast block: message span `flex:1; min-width:0`; toast with actions `align-items:flex-start` via `:has(.toast-actions)`; no new token fallbacks.
- ToastHost action button `data-testid="toast-action"`.

## Item 2 — miss + EN chip matrix `docs/screenshots/r33/`
- Ops: `aiMissToast`, `locale` (`en` | `zh-CN`).
- Shots: miss toast zh; EN Ask chip (+ optional safety pop); wide/narrow × dark/light.
- Expect: toast action 新开对话; chip label Ask; zh shots reset locale.

## Must-verify
1. Core-A 34/34; held-out H01–H08 green.
2. `test-r33-*` + wired R31/R32 green; r33 shots expect true after rebuild.
3. Designer: miss toast readable with action; EN chip Ask ≠ Agree; narrow chip ellipsis calm.
""", encoding="utf-8", newline="\n")
print("design written")

# --- toast.tsx: data-testid on action ---
toast = ROOT / "src/renderer/src/lib/toast.tsx"
tt = toast.read_text(encoding="utf-8")
if 'data-testid="toast-action"' not in tt:
    old = """                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setItems((prev) => prev.filter((x) => x.id !== t.id))
                    action.run()
                  }}
                >"""
    new = """                <button
                  key={action.label}
                  type="button"
                  data-testid="toast-action"
                  onClick={() => {
                    setItems((prev) => prev.filter((x) => x.id !== t.id))
                    action.run()
                  }}
                >"""
    if old not in tt:
        raise SystemExit("toast button block not found")
    tt = tt.replace(old, new, 1)
    toast.write_text(tt, encoding="utf-8", newline="\n")
    print("toast testid ok")
else:
    print("toast testid already")

# --- styles.css: R33 toast wrap ---
css_path = ROOT / "src/renderer/src/styles.css"
css = css_path.read_text(encoding="utf-8")
marker = "/* R33 Round33: miss toast long copy wraps; action stays */"
if marker not in css:
    # insert after .toast-actions button rule in features? Prefer styles after toast button block
    anchor = ".toast button {\n  margin-left: auto;\n  background: none;\n  border: 1px solid var(--accent);\n  color: var(--accent);\n  border-radius: var(--radius-sm, 4px);\n  padding: 2px var(--space-2);\n  cursor: pointer;\n}"
    # Note: existing toast has token fallbacks (known ui-n6 debt) — new R33 block must not add more
    block = """
""" + marker + """
.toast:has(.toast-actions) {
  align-items: flex-start;
}
.toast > span:first-of-type {
  flex: 1 1 auto;
  min-width: 0;
  line-height: var(--lh-snug);
}
.toast:has(.toast-actions) .toast-actions {
  margin-top: 1px;
}
"""
    if anchor not in css:
        # try looser
        idx = css.find(".toast button {")
        if idx < 0:
            raise SystemExit("toast button css not found")
        end = css.find("}", idx)
        end = css.find("\n", end) + 1
        css = css[:end] + block + css[end:]
    else:
        css = css.replace(anchor, anchor + block, 1)
    css_path.write_text(css, encoding="utf-8", newline="\n")
    print("css ok")
else:
    print("css already")

# --- test-r33-visual-audit-toast.ts ---
test = ROOT / "scripts/test-r33-visual-audit-toast.ts"
test.write_text("""/** R33: full-page visual audit quick P2 — toast long-copy wrap + toast-action testid. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R33 Round33: miss toast long copy wraps'))
const start = css.indexOf('R33 Round33: miss toast long copy wraps')
const block = css.slice(start, start + 500)
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks in R33 toast CSS')
assert.ok(block.includes('.toast:has(.toast-actions)'))
assert.ok(block.includes('align-items: flex-start'))
assert.ok(block.includes('min-width: 0'))
assert.ok(block.includes('flex: 1 1 auto') || block.includes('flex:1 1 auto'))

const toast = norm('src/renderer/src/lib/toast.tsx')
assert.ok(toast.includes('data-testid="toast-action"'))

const design = norm('docs/design/r33-full-page-visual-audit.md')
assert.ok(design.includes('full-page visual audit'))
assert.ok(design.includes('新开对话') || design.includes('miss'))
assert.ok(design.includes('Ask'))

const backlog = norm('docs/backlog.md')
assert.ok(
  backlog.includes('Round 33') ||
    backlog.includes('2026-11-05 Round 33') ||
    backlog.includes('整页视觉')
)

console.log('test-r33-visual-audit-toast: ok')
""", encoding="utf-8", newline="\n")
print("test1 written")
print("item1 patch done")
