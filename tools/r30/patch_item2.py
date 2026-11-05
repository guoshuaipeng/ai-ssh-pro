# -*- coding: utf-8 -*-
"""R30 item2: prod↔readonly contrast shot matrix + harness wiring."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

matrix = ROOT / "scripts/ai-shot-matrix-r30.mjs"
matrix.write_text("""/** Round 30: prod↔readonly host-banner contrast matrix (every-3 visual audit). */
export const R30_AI_SHOT_NAMES = [
  'r30-contrast-prod',
  'r30-contrast-prod-narrow',
  'r30-contrast-readonly',
  'r30-contrast-readonly-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r30AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectProd =
    "!!(document.querySelector('[data-testid=ai-prod-auto-banner]')&&!document.querySelector('[data-testid=ai-readonly-banner]')&&(document.querySelector('[data-testid=ai-prod-auto-banner]').textContent||'').includes('自动'))"
  const expectRo =
    "!!(document.querySelector('[data-testid=ai-readonly-banner]')&&!document.querySelector('[data-testid=ai-prod-auto-banner]')&&(document.querySelector('[data-testid=ai-readonly-banner]').textContent||'').includes('只读'))"
  return [
    {
      name: 'r30-contrast-prod',
      wait: 1400,
      steps: [...open, { op: 'aiProdBanner' }],
      expect: expectProd
    },
    {
      name: 'r30-contrast-prod-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiProdBanner' }],
      expect: expectProd
    },
    {
      name: 'r30-contrast-readonly',
      wait: 1400,
      steps: [...open, { op: 'aiReadonlyBanner' }],
      expect: expectRo
    },
    {
      name: 'r30-contrast-readonly-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiReadonlyBanner' }],
      expect: expectRo
    }
  ]
}
""", encoding="utf-8")
print("matrix ok")

# Wire screenshot-key-screens.mjs
har = ROOT / "scripts/screenshot-key-screens.mjs"
ht = har.read_text(encoding="utf-8")
if "ai-shot-matrix-r30.mjs" not in ht:
    ht = ht.replace(
        "import { r29AiShots } from './ai-shot-matrix-r29.mjs'",
        "import { r29AiShots } from './ai-shot-matrix-r29.mjs'\nimport { r30AiShots } from './ai-shot-matrix-r30.mjs'",
        1,
    )
    # Insert chrome slice after r29 block
    old = """  // Round 29: readonly host calm banner
  ...${JSON.stringify(r29AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    new = """  // Round 29: readonly host calm banner
  ...${JSON.stringify(r29AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 30: prod↔readonly contrast (visual audit)
  ...${JSON.stringify(r30AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    if old not in ht:
        raise SystemExit("r29 chrome slice anchor missing")
    ht = ht.replace(old, new, 1)
    har.write_text(ht, encoding="utf-8")
    print("harness wired")
else:
    print("harness already")

readme = ROOT / "docs/screenshots/r30/README.md"
readme.write_text("""# Round 30 screenshots — prod↔readonly banner contrast

Every-3 full-page visual audit deliverable: **same folder** compares production auto-run warn strip vs readonly calm ok strip (wide/narrow × dark/light).

| File | State | Expect |
|------|-------|--------|
| `*-r30-contrast-prod.png` | demoHost + `aiProdBanner` | `ai-prod-auto-banner` only; Chinese 自动 |
| `*-r30-contrast-prod-narrow.png` | Same, narrow | chip readable; hint hidden ≤230px (R30 CSS) |
| `*-r30-contrast-readonly.png` | demoHost + `aiReadonlyBanner` | `ai-readonly-banner` only; Chinese 只读 |
| `*-r30-contrast-readonly-narrow.png` | Same, narrow | chip readable; hint hidden ≤230px |

Ops: `aiProdBanner` / `aiReadonlyBanner` (AIPanel `screenshotProtectionOverride`).

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r30 --set chrome --only r30-contrast-prod,r30-contrast-prod-narrow,r30-contrast-readonly,r30-contrast-readonly-narrow --themes dark,light
```
""", encoding="utf-8")
print("readme ok")

test = ROOT / "scripts/test-r30-contrast-shots.ts"
test.write_text("""/** R30 polish: prod↔readonly contrast screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r30AiShots, R30_AI_SHOT_NAMES } from './ai-shot-matrix-r30.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const shots = r30AiShots()
assert.deepEqual(shots.map((s) => s.name), R30_AI_SHOT_NAMES)
assert.equal(R30_AI_SHOT_NAMES.length, 4)

const prod = shots.find((s) => s.name === 'r30-contrast-prod')
assert.ok(prod?.steps?.some((st) => st.op === 'aiProdBanner'))
assert.ok(prod?.expect?.includes('ai-prod-auto-banner'))
assert.ok(prod?.expect?.includes('ai-readonly-banner'))
assert.ok(prod?.expect?.includes('自动'))
assert.equal(prod?.narrow, undefined)

const prodN = shots.find((s) => s.name === 'r30-contrast-prod-narrow')
assert.equal(prodN?.narrow, true)
assert.ok(prodN?.steps?.some((st) => st.op === 'aiProdBanner'))

const ro = shots.find((s) => s.name === 'r30-contrast-readonly')
assert.ok(ro?.steps?.some((st) => st.op === 'aiReadonlyBanner'))
assert.ok(ro?.expect?.includes('ai-readonly-banner'))
assert.ok(ro?.expect?.includes('只读'))
assert.ok(ro?.expect?.includes('ai-prod-auto-banner'))

const roN = shots.find((s) => s.name === 'r30-contrast-readonly-narrow')
assert.equal(roN?.narrow, true)

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r30.mjs'"))
assert.ok(har.includes('r30AiShots()'))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R30 Round30: host banner touch + narrow'))

const readme = norm('docs/screenshots/r30/README.md')
assert.ok(readme.includes('contrast'))
assert.ok(readme.includes('aiProdBanner'))
assert.ok(readme.includes('aiReadonlyBanner'))

console.log('test-r30-contrast-shots: ok', R30_AI_SHOT_NAMES.length)
""", encoding="utf-8")
print("test2 ok")

# Wire package.json
pkg = ROOT / "package.json"
raw = pkg.read_text(encoding="utf-8")
if "test-r30-visual-audit-banner" not in raw:
    # append after r28-filter-empty-decline (end of test:parts chain before closing quote)
    anchors = [
        'scripts/test-r28-filter-empty-decline.ts"',
        'scripts/test-r29-readonly-banner-shots.ts',
    ]
    add = (
        " && npx tsx --tsconfig tsconfig.web.json scripts/test-r30-visual-audit-banner.ts"
        " && npx tsx --tsconfig tsconfig.node.json scripts/test-r30-contrast-shots.ts\""
    )
    if 'scripts/test-r28-filter-empty-decline.ts"' in raw:
        raw = raw.replace(
            'scripts/test-r28-filter-empty-decline.ts"',
            'scripts/test-r28-filter-empty-decline.ts"'[:-1] + add[1:],  # messy
            1,
        )
        # Fix properly:
        raw = pkg.read_text(encoding="utf-8")
        raw = raw.replace(
            'scripts/test-r28-filter-empty-decline.ts"',
            'scripts/test-r28-filter-empty-decline.ts'
            ' && npx tsx --tsconfig tsconfig.web.json scripts/test-r30-visual-audit-banner.ts'
            ' && npx tsx --tsconfig tsconfig.node.json scripts/test-r30-contrast-shots.ts"',
            1,
        )
        pkg.write_text(raw, encoding="utf-8")
        print("pkg wired after r28")
    else:
        raise SystemExit("pkg anchor missing")
else:
    print("pkg already")

print("item2 done")
