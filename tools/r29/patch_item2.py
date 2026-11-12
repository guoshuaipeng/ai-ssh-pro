"""Wire r29 matrix into harness + package.json + README + test."""
from pathlib import Path

# harness
har = Path("scripts/screenshot-key-screens.mjs")
ht = har.read_text(encoding="utf-8")
if "ai-shot-matrix-r29" not in ht:
    ht = ht.replace(
        "import { r28AiShots } from './ai-shot-matrix-r28.mjs'\n",
        "import { r28AiShots } from './ai-shot-matrix-r28.mjs'\nimport { r29AiShots } from './ai-shot-matrix-r29.mjs'\n",
        1,
    )
    old = """  // Round 28: audit filter-empty + pending Decline demoted
  ...${JSON.stringify(r28AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    new = """  // Round 28: audit filter-empty + pending Decline demoted
  ...${JSON.stringify(r28AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 29: readonly host calm banner
  ...${JSON.stringify(r29AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    assert old in ht, "r28 block missing"
    ht = ht.replace(old, new, 1)
    har.write_text(ht, encoding="utf-8")
    print("harness ok")
else:
    print("harness already")

# test
Path("scripts/test-r29-readonly-banner-shots.ts").write_text("""/** R29 polish: readonly banner screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r29AiShots, R29_AI_SHOT_NAMES } from './ai-shot-matrix-r29.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const shots = r29AiShots()
assert.deepEqual(shots.map((s) => s.name), R29_AI_SHOT_NAMES)
assert.equal(R29_AI_SHOT_NAMES.length, 2)

const wide = shots.find((s) => s.name === 'r29-readonly-banner')
assert.ok(wide?.steps?.some((st) => st.op === 'aiReadonlyBanner'))
assert.ok(wide?.expect?.includes('ai-readonly-banner'))
assert.ok(wide?.expect?.includes('ai-prod-auto-banner'))
assert.equal(wide?.narrow, undefined)

const narrow = shots.find((s) => s.name === 'r29-readonly-banner-narrow')
assert.equal(narrow?.narrow, true)
assert.ok(narrow?.steps?.some((st) => st.op === 'aiReadonlyBanner'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes(\"detail?.op === 'aiReadonlyBanner'\"))
assert.ok(panel.includes(\"setScreenshotProtectionOverride('readonly')\"))
assert.ok(panel.includes('data-testid=\"ai-readonly-banner\"'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiReadonlyBanner'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes(\"from './ai-shot-matrix-r29.mjs'\"))
assert.ok(har.includes('r29AiShots()'))

const css = norm('src/renderer/src/styles.css')
start = css.indexOf('Round 29: read-only host calm banner')
assert.ok(start >= 0)
block = css[start:start + 700]
assert.ok(block.includes('.ai-readonly-banner'))
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks in R29 CSS')

const readme = norm('docs/screenshots/r29/README.md')
assert.ok(readme.includes('readonly'))
assert.ok(readme.includes('aiReadonlyBanner'))

console.log('test-r29-readonly-banner-shots: ok', R29_AI_SHOT_NAMES.length)
""".replace('start =', 'const start =').replace('block =', 'const block ='), encoding="utf-8")
# Fix the test file properly - the replace hack is messy. Rewrite cleanly.
Path("scripts/test-r29-readonly-banner-shots.ts").write_text(
    """/** R29 polish: readonly banner screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r29AiShots, R29_AI_SHOT_NAMES } from './ai-shot-matrix-r29.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const shots = r29AiShots()
assert.deepEqual(shots.map((s) => s.name), R29_AI_SHOT_NAMES)
assert.equal(R29_AI_SHOT_NAMES.length, 2)

const wide = shots.find((s) => s.name === 'r29-readonly-banner')
assert.ok(wide?.steps?.some((st) => st.op === 'aiReadonlyBanner'))
assert.ok(wide?.expect?.includes('ai-readonly-banner'))
assert.ok(wide?.expect?.includes('ai-prod-auto-banner'))
assert.equal(wide?.narrow, undefined)

const narrow = shots.find((s) => s.name === 'r29-readonly-banner-narrow')
assert.equal(narrow?.narrow, true)
assert.ok(narrow?.steps?.some((st) => st.op === 'aiReadonlyBanner'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes(\"detail?.op === 'aiReadonlyBanner'\"))
assert.ok(panel.includes(\"setScreenshotProtectionOverride('readonly')\"))
assert.ok(panel.includes('data-testid=\"ai-readonly-banner\"'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiReadonlyBanner'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes(\"from './ai-shot-matrix-r29.mjs'\"))
assert.ok(har.includes('r29AiShots()'))

const css = norm('src/renderer/src/styles.css')
const start = css.indexOf('Round 29: read-only host calm banner')
assert.ok(start >= 0)
const block = css.slice(start, start + 700)
assert.ok(block.includes('.ai-readonly-banner'))
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks in R29 CSS')

const readme = norm('docs/screenshots/r29/README.md')
assert.ok(readme.includes('readonly'))
assert.ok(readme.includes('aiReadonlyBanner'))

console.log('test-r29-readonly-banner-shots: ok', R29_AI_SHOT_NAMES.length)
""",
    encoding="utf-8",
)
print("test ok")

# README
Path("docs/screenshots/r29").mkdir(parents=True, exist_ok=True)
Path("docs/screenshots/r29/README.md").write_text(
    """# Round 29 screenshots — readonly host calm banner

Symmetric to `r14-prod-banner` / prod-auto strip: **readonly** host shows calm ok-tone banner in AI panel; no prod strip; AI writes stay blocked.

| File | State | Expect |
|------|-------|--------|
| `*-r29-readonly-banner.png` | demoHost + `aiReadonlyBanner` | `ai-readonly-banner` visible; no `ai-prod-auto-banner`; Chinese 只读 |
| `*-r29-readonly-banner-narrow.png` | Same, narrow | ellipsis on hint; chip readable |

Op: `aiReadonlyBanner` (AIPanel sets `screenshotProtectionOverride='readonly'`).

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r29 --set chrome --only r29-readonly-banner,r29-readonly-banner-narrow --themes dark,light
```
""",
    encoding="utf-8",
)
print("readme ok")

# package.json
pkg = Path("package.json")
pt = pkg.read_text(encoding="utf-8")
old = 'npx tsx --tsconfig tsconfig.web.json scripts/test-readonly-host-hint.ts'
new = old + ' && npx tsx --tsconfig tsconfig.node.json scripts/test-r29-readonly-banner-shots.ts'
if 'test-r29-readonly-banner-shots' not in pt:
    assert old in pt
    pkg.write_text(pt.replace(old, new, 1), encoding='utf-8')
    print('pkg ok')
else:
    print('pkg already')
