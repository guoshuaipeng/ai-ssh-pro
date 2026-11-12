# -*- coding: utf-8 -*-
"""Round 20 item 2: expand screenshot harness for policy-menu-open + pending-dock-narrow."""
from pathlib import Path
import json

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

matrix = r'''/** Round 20: R19 debt — policy menu open + pending dock narrow screenshot matrix.
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 */
export const R20_AI_SHOT_NAMES = [
  'r20-policy-menu-open',
  'r20-pending-dock-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r20AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  return [
    {
      name: 'r20-policy-menu-open',
      wait: 1300,
      steps: [...open, { op: 'aiComposerPop', which: 'safety' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-safety-pop]')&&document.querySelector('[data-testid=ai-safety-chip].is-open')&&document.querySelector('[data-testid=ai-safety-option].is-current'))"
    },
    {
      name: 'r20-pending-dock-narrow',
      narrow: true,
      wait: 1400,
      steps: [...open, { op: 'aiConfirm', preview: 'systemctl restart nginx' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-pending-confirm]')&&document.querySelector('[data-testid=ai-pending-agree]')&&document.querySelector('[data-testid=ai-pending-confirm]').getAttribute('data-r19-narrow')==='1')"
    }
  ]
}
'''
(ROOT / "scripts/ai-shot-matrix-r20.mjs").write_text(matrix, encoding="utf-8")
print("matrix written")

# wire screenshot-key-screens.mjs
har = ROOT / "scripts/screenshot-key-screens.mjs"
ht = har.read_text(encoding="utf-8")
if "r20AiShots" not in ht:
    ht = ht.replace(
        "import { r18AiShots } from './ai-shot-matrix-r18.mjs'\n",
        "import { r18AiShots } from './ai-shot-matrix-r18.mjs'\nimport { r20AiShots } from './ai-shot-matrix-r20.mjs'\n",
        1,
    )
    old = """  // Round 18: plan-step align + audit↔dialog deep links
  ...${JSON.stringify(r18AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]
"""
    new = """  // Round 18: plan-step align + audit↔dialog deep links
  ...${JSON.stringify(r18AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 20: policy menu open + pending dock narrow (R19 debt)
  ...${JSON.stringify(r20AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]
"""
    if old not in ht:
        raise SystemExit("harness inject anchor not found")
    har.write_text(ht.replace(old, new, 1), encoding="utf-8")
    print("screenshot-key-screens wired")
else:
    print("harness already")

# App: ensure aiComposerPop opens AI panel (stash-safe)
app = ROOT / "src/renderer/src/App.tsx"
at = app.read_text(encoding="utf-8")
if "detail.op === 'aiComposerPop'" not in at:
    # insert before aiConfirm handler
    old = "      if (detail.op === 'aiConfirm') {"
    new = """      if (detail.op === 'aiComposerPop') {
        setQuickOpen(false)
        setTourOpen(false)
        ensureAiVisible()
        openRightPanelRef.current('ai')
        ;(window as unknown as { __aissShotPop?: string }).__aissShotPop =
          detail.which === 'model' ? 'model' : 'safety'
        return
      }
      if (detail.op === 'aiConfirm') {"""
    if old not in at:
        raise SystemExit("aiConfirm App anchor not found")
    app.write_text(at.replace(old, new, 1), encoding="utf-8")
    print("App aiComposerPop open-panel added")
else:
    print("App aiComposerPop already")

test = r'''/** R20: policy-menu-open + pending-dock-narrow screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r20AiShots, R20_AI_SHOT_NAMES } from './ai-shot-matrix-r20.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r20AiShots()
assert.deepEqual(shots.map((s) => s.name), R20_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const policy = shots.find((s) => s.name === 'r20-policy-menu-open')
assert.ok(policy?.steps?.some((st) => st.op === 'aiComposerPop' && st.which === 'safety'))
assert.ok(policy?.expect?.includes('ai-safety-pop'))
assert.ok(policy?.expect?.includes('is-open'))

const dock = shots.find((s) => s.name === 'r20-pending-dock-narrow')
assert.equal(dock?.narrow, true)
assert.ok(dock?.steps?.some((st) => st.op === 'aiConfirm'))
assert.ok(dock?.expect?.includes('ai-pending-confirm'))
assert.ok(dock?.expect?.includes('data-r19-narrow'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiComposerPop'))
assert.ok(hooks.includes('aiConfirm'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiComposerPop'") || panel.includes("detail.op === 'aiComposerPop'"))
assert.ok(panel.includes("detail.op !== 'aiConfirm'") || panel.includes("detail.op === 'aiConfirm'") || panel.includes("op !== 'aiConfirm'"))
assert.ok(panel.includes('data-testid="ai-safety-pop"'))
assert.ok(panel.includes('data-testid="ai-pending-confirm"'))
assert.ok(panel.includes('data-r19-narrow="1"'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiComposerPop'"))
assert.ok(app.includes("detail.op === 'aiConfirm'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r20.mjs'"))
assert.ok(har.includes('r20AiShots()'))

console.log('test-r20-ai-shot-harness: ok', R20_AI_SHOT_NAMES.length)
'''
(ROOT / "scripts/test-r20-ai-shot-harness.ts").write_text(test, encoding="utf-8")
print("harness test written")

# package.json
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
parts = pkg["scripts"]["test:parts"]
needle = "npx tsx --tsconfig tsconfig.web.json scripts/test-r20-memory-visibility.ts"
add = needle + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r20-ai-shot-harness.ts"
if "test-r20-ai-shot-harness" not in parts:
    if needle not in parts:
        raise SystemExit("memory test anchor missing")
    pkg["scripts"]["test:parts"] = parts.replace(needle, add, 1)
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("package wired harness test")
else:
    print("package already")

readme = ROOT / "docs/screenshots/r20"
readme.mkdir(parents=True, exist_ok=True)
(readme / "README.md").write_text(
    """# Round 20 screenshots — policy menu open + pending dock narrow

Extends the Electron AI harness with R19-debt states from Round 19 polish.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r20-policy-menu-open.png` | Strategy menu open | `ai-safety-pop` + chip `is-open` + current option focused |
| `*-r20-pending-dock-narrow.png` | Confirm dock narrow | `ai-pending-confirm` with `data-r19-narrow=1` + Agree |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r20.mjs` (ops `aiComposerPop` / `aiConfirm`).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r20 --set chrome --only r20-policy-menu-open,r20-pending-dock-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r20 --no-build --set chrome --only r20-policy-menu-open,r20-pending-dock-narrow --themes dark,light
```
""",
    encoding="utf-8",
)
print("README written")
print("item2 files ready")
