# -*- coding: utf-8 -*-
from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# App.tsx open list
app = ROOT / "src" / "renderer" / "src" / "App.tsx"
at = app.read_text(encoding="utf-8")
old = """        detail.op === 'aiAskProgress' ||
        detail.op === 'aiBatchSticky'
      ) {"""
new = """        detail.op === 'aiAskProgress' ||
        detail.op === 'aiBatchSticky' ||
        detail.op === 'aiPlanStepAlign' ||
        detail.op === 'aiExecAuditLink' ||
        detail.op === 'aiAuditFocus'
      ) {"""
if old not in at:
    raise SystemExit("App open list missing")
app.write_text(at.replace(old, new, 1), encoding="utf-8")
print("App.tsx patched")

# screenshot-key-screens.mjs
har = ROOT / "scripts" / "screenshot-key-screens.mjs"
ht = har.read_text(encoding="utf-8")
if "r18AiShots" not in ht:
    ht = ht.replace(
        "import { r17AiShots } from './ai-shot-matrix-r17.mjs'\n",
        "import { r17AiShots } from './ai-shot-matrix-r17.mjs'\nimport { r18AiShots } from './ai-shot-matrix-r18.mjs'\n",
        1,
    )
    old_inj = """  // Round 17: ask progress + sticky batch bar
  ...${JSON.stringify(r17AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]
"""
    new_inj = """  // Round 17: ask progress + sticky batch bar
  ...${JSON.stringify(r17AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 18: plan-step align + audit↔dialog deep links
  ...${JSON.stringify(r18AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]
"""
    if old_inj not in ht:
        raise SystemExit("harness inject anchor missing")
    ht = ht.replace(old_inj, new_inj, 1)
    har.write_text(ht, encoding="utf-8")
    print("harness patched")
else:
    print("harness already has r18")
