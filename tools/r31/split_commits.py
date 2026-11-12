# -*- coding: utf-8 -*-
"""Split R31 into item1 then item2 commits by temporarily removing polish."""
from pathlib import Path
import subprocess, textwrap

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# Save current panel/matrix/tests
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
matrix = ROOT / "scripts/ai-shot-matrix-r31.mjs"
test1 = ROOT / "scripts/test-r31-empty-error-shots.ts"
readme = ROOT / "docs/screenshots/r31/README.md"

panel_full = panel.read_text(encoding="utf-8")
matrix_full = matrix.read_text(encoding="utf-8")
test1_full = test1.read_text(encoding="utf-8")
readme_full = readme.read_text(encoding="utf-8")

# --- Item1-only panel: keep needsModelPick for JSX model-missing, but DO NOT suppress banners ---
pt = panel_full
pt = pt.replace("panelProdAuto && !needsModelPick ?", "panelProdAuto ?", 1)
pt = pt.replace("panelReadonly && !panelProdAuto && !needsModelPick ?", "panelReadonly && !panelProdAuto ?", 1)
# Keep withProdBanner handler but item1 matrix won't use conflict shot
panel.write_text(pt, encoding="utf-8")

# Item1 matrix: 6 shots, no conflict
mt = matrix_full
# remove conflict from names and array
mt = mt.replace(
    """  'r31-error-retry-narrow',
  'r31-model-missing-vs-prod-narrow'
]""",
    """  'r31-error-retry-narrow'
]""",
)
# remove conflict shot object
import re
mt2 = re.sub(
    r",\n    \{\n      name: 'r31-model-missing-vs-prod-narrow',.*?\n    \}",
    "",
    mt,
    count=1,
    flags=re.S,
)
matrix.write_text(mt2, encoding="utf-8")

# Item1 test length 6, no conflict assert
t1 = test1_full.replace("assert.equal(R31_AI_SHOT_NAMES.length, 7)", "assert.equal(R31_AI_SHOT_NAMES.length, 6)")
t1 = re.sub(
    r"const conflict = shots\.find\(\(s\) => s\.name === 'r31-model-missing-vs-prod-narrow'\)\nassert\.ok\(conflict\?\.steps\?\.some\(\(st\) => st\.op === 'aiModelMissing'\)\)\n",
    "",
    t1,
)
test1.write_text(t1, encoding="utf-8")

# README without conflict row for item1
rt = readme_full
rt = re.sub(r"\| `\*-r31-model-missing-vs-prod-narrow\.png` \|.*\|\n", "", rt)
rt = rt.replace(
    ",r31-model-missing-vs-prod-narrow",
    "",
)
readme.write_text(rt, encoding="utf-8")

# Move item2 test aside
test2 = ROOT / "scripts/test-r31-model-missing-banner.ts"
test2_full = test2.read_text(encoding="utf-8")
test2.unlink()

print("item1-only tree ready")
print("matrix names check:")
print([l for l in mt2.splitlines() if "r31-" in l and "'" in l][:20])
