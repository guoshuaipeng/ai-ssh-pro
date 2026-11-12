# -*- coding: utf-8 -*-
"""Temporarily strip memory-only bits so failure commit is clean; restore after."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = panel.read_text(encoding="utf-8")
pt2 = pt.replace(
    "                  aria-controls=\"ai-memory-pop\"\n                  aria-label={`${tg('wm.memory')} · ${memoryView.count}`}\n                  title={memoryView.summaryLine || tg('wm.memoryTitle')}",
    "                  aria-controls=\"ai-memory-pop\"\n                  title={memoryView.summaryLine || tg('wm.memoryTitle')}",
    1,
)
panel.write_text(pt2, encoding="utf-8")

css = ROOT / "src/renderer/src/styles.css"
ct = css.read_text(encoding="utf-8")
mem = """/* R21: memory chip ultra-narrow — count only, label via aria-label/title */
@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 4.5rem;
    flex: 0 0 auto;
    flex-basis: auto;
  }
  .ai-panel .ai-memory-chip-label {
    display: none;
  }
  .ai-panel .ai-memory-chip-count {
    flex: 0 0 auto;
  }
}
"""
old_r20 = """@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 100%;
    flex-basis: 100%;
  }
}
"""
# If we already replaced R20 container with R21, restore R20-ish for commit1 then put R21 in commit2
if mem in ct:
    ct = ct.replace(mem, old_r20, 1)
    css.write_text(ct, encoding="utf-8")
    print("memory css stripped for commit1")
else:
    print("memory css pattern not found", mem[:40] in ct)

# stash package.json memory test for commit2
pkg = ROOT / "package.json"
pk = pkg.read_text(encoding="utf-8")
pk2 = pk.replace(
    " && npx tsx --tsconfig tsconfig.web.json scripts/test-r21-memory-chip-narrow.ts",
    "",
    1,
)
pkg.write_text(pk2, encoding="utf-8")
print("panel/pkg ready for failure-only commit")
