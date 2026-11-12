# -*- coding: utf-8 -*-
"""Restore R31 item2: banner suppress + conflict shot."""
from pathlib import Path
import re

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = panel.read_text(encoding="utf-8")

# Restore banner gates — find exact banner JSX
if "panelProdAuto && !needsModelPick" not in pt:
    # Find the prod banner button block
    idx = pt.find('data-testid="ai-prod-auto-banner"')
    assert idx > 0
    before = pt.rfind("{panelProdAuto ?", 0, idx)
    assert before > 0
    pt = pt[:before] + "{panelProdAuto && !needsModelPick ?" + pt[before + len("{panelProdAuto ?"):]
    print("prod gate restored")
else:
    print("prod gate already")

if "panelReadonly && !panelProdAuto && !needsModelPick" not in pt:
    old = "{panelReadonly && !panelProdAuto ?"
    new = "{panelReadonly && !panelProdAuto && !needsModelPick ?"
    assert old in pt
    pt = pt.replace(old, new, 1)
    print("ro gate restored")
else:
    print("ro gate already")

panel.write_text(pt, encoding="utf-8")

# Restore matrix conflict shot
matrix = ROOT / "scripts/ai-shot-matrix-r31.mjs"
mt = matrix.read_text(encoding="utf-8")
if "r31-model-missing-vs-prod-narrow" not in mt:
    mt = mt.replace(
        """  'r31-error-retry-narrow'
]""",
        """  'r31-error-retry-narrow',
  'r31-model-missing-vs-prod-narrow'
]""",
    )
    needle = """    {
      name: 'r31-error-retry-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'AI_HTTP_429', message: '请求过于频繁，请稍后重试。' }],
      expect: expectErrRetry
    }
  ]
}"""
    insert = """    {
      name: 'r31-error-retry-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'AI_HTTP_429', message: '请求过于频繁，请稍后重试。' }],
      expect: expectErrRetry
    },
    {
      name: 'r31-model-missing-vs-prod-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiModelMissing', withProdBanner: true }],
      expect: expectMissing
    }
  ]
}"""
    assert needle in mt, "retry shot needle missing"
    mt = mt.replace(needle, insert, 1)
    matrix.write_text(mt, encoding="utf-8")
    print("matrix restored")
else:
    print("matrix already")

# Update item1 test to 7
t1 = ROOT / "scripts/test-r31-empty-error-shots.ts"
tt = t1.read_text(encoding="utf-8")
tt = tt.replace("assert.equal(R31_AI_SHOT_NAMES.length, 6)", "assert.equal(R31_AI_SHOT_NAMES.length, 7)")
if "r31-model-missing-vs-prod-narrow" not in tt:
    tt = tt.replace(
        "console.log('test-r31-empty-error-shots: ok', R31_AI_SHOT_NAMES.length)",
        "const conflict = shots.find((s) => s.name === 'r31-model-missing-vs-prod-narrow')\n"
        "assert.ok(conflict?.steps?.some((st) => st.op === 'aiModelMissing'))\n"
        "console.log('test-r31-empty-error-shots: ok', R31_AI_SHOT_NAMES.length)",
    )
t1.write_text(tt, encoding="utf-8")

# Restore item2 test
(ROOT / "scripts/test-r31-model-missing-banner.ts").write_text(
    """/** R31 polish: model-missing suppresses host banners (no double strip). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r31AiShots, R31_AI_SHOT_NAMES } from './ai-shot-matrix-r31.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

assert.ok(R31_AI_SHOT_NAMES.includes('r31-model-missing-vs-prod-narrow'))
const conflict = r31AiShots().find((s) => s.name === 'r31-model-missing-vs-prod-narrow')
assert.equal(conflict?.narrow, true)
assert.ok(
  conflict?.steps?.some(
    (st) => st.op === 'aiModelMissing' && (st as { withProdBanner?: boolean }).withProdBanner === true
  )
)
assert.ok(conflict?.expect?.includes('ai-model-missing'))
assert.ok(conflict?.expect?.includes('ai-prod-auto-banner'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('const needsModelPick = aiNeedsModelPick'))
assert.ok(panel.includes('panelProdAuto && !needsModelPick'))
assert.ok(panel.includes('panelReadonly && !panelProdAuto && !needsModelPick'))
assert.ok(panel.includes('{needsModelPick ? ('))
assert.ok(panel.includes('withProdBanner'))

console.log('test-r31-model-missing-banner: ok')
""",
    encoding="utf-8",
)

# README conflict row
readme = ROOT / "docs/screenshots/r31/README.md"
rt = readme.read_text(encoding="utf-8")
if "r31-model-missing-vs-prod-narrow" not in rt:
    rt = rt.replace(
        "| `*-r31-error-retry-narrow.png` | `http_429` | `data-primary=retry` |\n",
        "| `*-r31-error-retry-narrow.png` | `http_429` | `data-primary=retry` |\n"
        "| `*-r31-model-missing-vs-prod-narrow.png` | model-missing + prod override | model-missing only; **no** prod banner |\n",
    )
    rt = rt.replace(
        "r31-error-settings-narrow,r31-error-retry-narrow --themes",
        "r31-error-settings-narrow,r31-error-retry-narrow,r31-model-missing-vs-prod-narrow --themes",
    )
    readme.write_text(rt, encoding="utf-8")
    print("readme restored")
else:
    print("readme already has conflict")

print("item2 tree ready")
