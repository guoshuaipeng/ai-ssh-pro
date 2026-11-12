# -*- coding: utf-8 -*-
"""R31 item2: model-missing suppresses host banners + conflict shot."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = panel_path.read_text(encoding="utf-8")

# Introduce needsModelPick variable near panelReadonly / before render banners
if "const needsModelPick =" not in pt:
    old = "  const panelReadonly = readonlyHostHint({"
    # Find fuller context
    idx = pt.find("  const panelProdAuto = prodAutoHint({")
    assert idx > 0
    # Insert needsModelPick before panelProdAuto
    insert = (
        "  const needsModelPick = aiNeedsModelPick(\n"
        "    screenshotModelMissing ? '' : currentModel,\n"
        "    screenshotModelMissing ? [] : modelList\n"
        "  )\n"
    )
    pt = pt[:idx] + insert + pt[idx:]
    print("needsModelPick: ok")
else:
    print("needsModelPick: already")

# Update JSX model-missing to use needsModelPick
old_jsx_model = "{aiNeedsModelPick(screenshotModelMissing ? '' : currentModel, screenshotModelMissing ? [] : modelList) ? ("
new_jsx_model = "{needsModelPick ? ("
if old_jsx_model in pt:
    pt = pt.replace(old_jsx_model, new_jsx_model, 1)
    print("jsx model: ok")
elif "{needsModelPick ? (" in pt:
    print("jsx model: already")
else:
    print("WARN jsx model pattern")

# Suppress banners when needsModelPick
old_prod = "{panelProdAuto ? ("
new_prod = "{panelProdAuto && !needsModelPick ? ("
# careful - might match multiple; check count
count = pt.count(old_prod)
print("panelProdAuto ? count:", count)
if "panelProdAuto && !needsModelPick" not in pt:
    # only the banner one near ai-prod-auto-banner
    idx = pt.find('data-testid="ai-prod-auto-banner"')
    assert idx > 0
    window = pt[idx-200:idx]
    if "{panelProdAuto ? (" in window:
        # replace nearest before
        before = pt.rfind("{panelProdAuto ? (", 0, idx)
        pt = pt[:before] + "{panelProdAuto && !needsModelPick ? (" + pt[before+len("{panelProdAuto ? ("):]
        print("prod banner gate: ok")
    else:
        print("WARN prod window", repr(window))
else:
    print("prod banner gate: already")

old_ro = "{panelReadonly && !panelProdAuto ? ("
new_ro = "{panelReadonly && !panelProdAuto && !needsModelPick ? ("
if old_ro in pt:
    pt = pt.replace(old_ro, new_ro, 1)
    print("readonly banner gate: ok")
elif "panelReadonly && !panelProdAuto && !needsModelPick" in pt:
    print("readonly banner gate: already")
else:
    print("WARN readonly gate")

panel_path.write_text(pt, encoding="utf-8")
print("panel item2 written")

# Extend matrix with conflict shot
matrix = ROOT / "scripts/ai-shot-matrix-r31.mjs"
mt = matrix.read_text(encoding="utf-8")
if "r31-model-missing-vs-prod-narrow" not in mt:
    mt = mt.replace(
        """export const R31_AI_SHOT_NAMES = [
  'r31-empty',
  'r31-empty-narrow',
  'r31-model-missing',
  'r31-model-missing-narrow',
  'r31-error-settings-narrow',
  'r31-error-retry-narrow'
]""",
        """export const R31_AI_SHOT_NAMES = [
  'r31-empty',
  'r31-empty-narrow',
  'r31-model-missing',
  'r31-model-missing-narrow',
  'r31-error-settings-narrow',
  'r31-error-retry-narrow',
  'r31-model-missing-vs-prod-narrow'
]""",
    )
    # Insert shot before closing of return array — find last error-retry shot end
    needle = """    {
      name: 'r31-error-retry-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'http_429', message: '请求过于频繁，请稍后重试。' }],
      expect: expectErrRetry
    }
  ]
}"""
    insert = """    {
      name: 'r31-error-retry-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'http_429', message: '请求过于频繁，请稍后重试。' }],
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
    assert needle in mt
    mt = mt.replace(needle, insert, 1)
    matrix.write_text(mt, encoding="utf-8")
    print("matrix conflict shot: ok")
else:
    print("matrix: already")

# Update README
readme = ROOT / "docs/screenshots/r31/README.md"
rt = readme.read_text(encoding="utf-8")
if "r31-model-missing-vs-prod-narrow" not in rt:
    rt = rt.replace(
        "| `*-r31-error-retry-narrow.png` | `http_429` | `data-primary=retry` |\n",
        "| `*-r31-error-retry-narrow.png` | `http_429` | `data-primary=retry` |\n"
        "| `*-r31-model-missing-vs-prod-narrow.png` | model-missing + prod override | model-missing only; **no** prod banner |\n",
    )
    rt = rt.replace(
        "--only r31-empty,r31-empty-narrow,r31-model-missing,r31-model-missing-narrow,r31-error-settings-narrow,r31-error-retry-narrow",
        "--only r31-empty,r31-empty-narrow,r31-model-missing,r31-model-missing-narrow,r31-error-settings-narrow,r31-error-retry-narrow,r31-model-missing-vs-prod-narrow",
    )
    readme.write_text(rt, encoding="utf-8")
    print("readme: ok")

# Item2 guard test
(ROOT / "scripts/test-r31-model-missing-banner.ts").write_text(
    """/** R31 polish: model-missing suppresses host banners (no double strip). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r31AiShots, R31_AI_SHOT_NAMES } from './ai-shot-matrix-r31.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

assert.ok(R31_AI_SHOT_NAMES.includes('r31-model-missing-vs-prod-narrow'))
const conflict = r31AiShots().find((s) => s.name === 'r31-model-missing-vs-prod-narrow')
assert.equal(conflict?.narrow, true)
assert.ok(conflict?.steps?.some((st) => st.op === 'aiModelMissing' && (st as { withProdBanner?: boolean }).withProdBanner === true))
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
print("item2 test: ok")
