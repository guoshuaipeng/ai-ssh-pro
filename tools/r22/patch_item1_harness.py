# -*- coding: utf-8 -*-
"""Round 22 item 1: expand screenshot harness with aiFailureEvidence (wide/narrow)."""
from pathlib import Path
import json

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

(ROOT / "docs/design").mkdir(parents=True, exist_ok=True)
(ROOT / "docs/design/r22-ai-failure-harness.md").write_text(
    """# Round 22 design — AI failure evidence harness + link/toast polish

## UX review (before code)
- Hierarchy: failure pin stays the loudest after a failed confirm; primary CTA remains「带证据重试」; Agree stays the only primary on the next confirm dock.
- Matrix: wide + narrow × dark + light for `aiFailureEvidence` so R21 pin is designer-visible without manual DOM inject.
- Polish link: failure card may offer a secondary「下一步待确认」that scrolls/highlights the pending dock — never a second Agree, never silent SSH write.
- Audit miss (R17 debt): keep `kind: info` (weak/calm, not error red); clearer Chinese; action「回到顶部」scrolls the AI message list. Empty match ≠「没有匹配」misuse — copy says the step is not in *this* chat.

## Must-verify
1. `docs/screenshots/r22/` dark/light × wide/narrow failure evidence expects green after rebuild.
2. Narrow: failure actions wrap; retry still full-width-ish; no clipped title.
3. With pending confirm after failure: dock `data-after-failure=1` + secondary chip; Agree still primary.
4. Audit jump miss: info toast + 回到顶部; panel already open.
""",
    encoding="utf-8",
)
print("design note written")

matrix = r'''/** Round 22: R21 failure evidence screenshot matrix (wide/narrow × themes via harness).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 */
export const R22_AI_SHOT_NAMES = [
  'r22-failure-evidence',
  'r22-failure-evidence-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r22AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectFail =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-retry]')&&document.querySelector('[data-testid=ai-failure-title]')&&document.querySelector('[data-testid=ai-exec-replay].has-failure-pin'))"
  return [
    {
      name: 'r22-failure-evidence',
      wait: 1400,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r22-failure-evidence-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    }
  ]
}
'''
(ROOT / "scripts/ai-shot-matrix-r22.mjs").write_text(matrix, encoding="utf-8")
print("matrix written")

har = ROOT / "scripts/screenshot-key-screens.mjs"
ht = har.read_text(encoding="utf-8")
if "r22AiShots" not in ht:
    ht = ht.replace(
        "import { r20AiShots } from './ai-shot-matrix-r20.mjs'\n",
        "import { r20AiShots } from './ai-shot-matrix-r20.mjs'\nimport { r22AiShots } from './ai-shot-matrix-r22.mjs'\n",
        1,
    )
    old = """  // Round 20: policy menu open + pending dock narrow (R19 debt)
  ...${JSON.stringify(r20AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]
"""
    new = """  // Round 20: policy menu open + pending dock narrow (R19 debt)
  ...${JSON.stringify(r20AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 22: R21 failure evidence pin (wide + narrow)
  ...${JSON.stringify(r22AiShots())}.map((s) => ({
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

# App already opens panel for aiFailureEvidence (R21). Verify.
app = (ROOT / "src/renderer/src/App.tsx").read_text(encoding="utf-8")
if "detail.op === 'aiFailureEvidence'" not in app:
    raise SystemExit("App missing aiFailureEvidence open-panel — R21 regression")
print("App aiFailureEvidence open-panel ok")

test = r'''/** R22: aiFailureEvidence wide/narrow screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r22AiShots, R22_AI_SHOT_NAMES } from './ai-shot-matrix-r22.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r22AiShots()
assert.deepEqual(shots.map((s) => s.name), R22_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const wide = shots.find((s) => s.name === 'r22-failure-evidence')
assert.ok(wide)
assert.notEqual(wide?.narrow, true)
assert.ok(wide?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(wide?.expect?.includes('ai-failure-evidence'))
assert.ok(wide?.expect?.includes('ai-failure-retry'))

const narrow = shots.find((s) => s.name === 'r22-failure-evidence-narrow')
assert.equal(narrow?.narrow, true)
assert.ok(narrow?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(narrow?.expect?.includes('has-failure-pin'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiFailureEvidence'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiFailureEvidence'"))
assert.ok(panel.includes('shot-r21-fail') || panel.includes('S27_FAIL_CMD'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiFailureEvidence'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r22.mjs'"))
assert.ok(har.includes('r22AiShots()'))

const er = norm('src/renderer/src/components/ExecReplay.tsx')
assert.ok(er.includes('data-testid="ai-failure-evidence"'))
assert.ok(er.includes('data-testid="ai-failure-retry"'))

console.log('test-r22-ai-shot-harness: ok', R22_AI_SHOT_NAMES.length)
'''
(ROOT / "scripts/test-r22-ai-shot-harness.ts").write_text(test, encoding="utf-8")
print("harness test written")

pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
parts = pkg["scripts"]["test:parts"]
needle = "npx tsx --tsconfig tsconfig.web.json scripts/test-r21-memory-chip-narrow.ts"
add = needle + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r22-ai-shot-harness.ts"
if "test-r22-ai-shot-harness" not in parts:
    if needle not in parts:
        raise SystemExit("r21 memory test anchor missing in test:parts")
    pkg["scripts"]["test:parts"] = parts.replace(needle, add, 1)
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("package wired harness test")
else:
    print("package already")

readme = ROOT / "docs/screenshots/r22"
readme.mkdir(parents=True, exist_ok=True)
(readme / "README.md").write_text(
    """# Round 22 screenshots — failure evidence pin (R21)

Captures the Round 21 S27 failure evidence card via declarative op `aiFailureEvidence`.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r22-failure-evidence.png` | Failure pin wide | `ai-failure-evidence` + retry CTA + `has-failure-pin` |
| `*-r22-failure-evidence-narrow.png` | Failure pin narrow | same expects at 1024 side panel |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r22.mjs` (op `aiFailureEvidence`).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --no-build --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow --themes dark,light
```
""",
    encoding="utf-8",
)
print("README written")
print("item1 files ready")
