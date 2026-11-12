# -*- coding: utf-8 -*-
"""R25 item1: expand failure-evidence screenshot matrix for 「下一步 · n」."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

matrix = ROOT / "scripts/ai-shot-matrix-r25.mjs"
matrix.write_text(
    """/** Round 25: failure evidence matrix with short 「下一步 · n」 next-confirm (wide+narrow).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 * Builds on R22 aiFailureEvidence + R24 short nextConfirmStep label.
 */
export const R25_AI_SHOT_NAMES = [
  'r25-failure-evidence',
  'r25-failure-evidence-narrow',
  'r25-failure-next-confirm',
  'r25-failure-next-confirm-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r25AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectFail =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-retry]')&&document.querySelector('[data-testid=ai-failure-title]')&&document.querySelector('[data-testid=ai-exec-replay].has-failure-pin'))"
  // R24 short label + aligned step (handler sets runProgress step:2 max:3)
  const expectNext =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-next-confirm][data-aligned-step=\\\"2\\\"]')&&document.querySelector('[data-testid=ai-pending-confirm][data-after-failure=\\\"1\\\"]')&&document.querySelector('[data-testid=ai-pending-agree]')&&/(下一步\\\\s*·\\\\s*2|Next\\\\s*·\\\\s*2)/.test((document.querySelector('[data-testid=ai-failure-next-confirm]')||{}).textContent||''))"
  return [
    {
      name: 'r25-failure-evidence',
      wait: 1400,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r25-failure-evidence-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r25-failure-next-confirm',
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectNext
    },
    {
      name: 'r25-failure-next-confirm-narrow',
      narrow: true,
      wait: 1600,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectNext
    }
  ]
}
""",
    encoding="utf-8",
)
print("matrix: written")

# Fix escaping in the expectNext - the above may have over-escaped.
# Re-read and write a cleaner version with proper JS string escaping.
matrix.write_text(
    r'''/** Round 25: failure evidence matrix with short 「下一步 · n」 next-confirm (wide+narrow).
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 * Builds on R22 aiFailureEvidence + R24 short nextConfirmStep label.
 */
export const R25_AI_SHOT_NAMES = [
  'r25-failure-evidence',
  'r25-failure-evidence-narrow',
  'r25-failure-next-confirm',
  'r25-failure-next-confirm-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r25AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectFail =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-retry]')&&document.querySelector('[data-testid=ai-failure-title]')&&document.querySelector('[data-testid=ai-exec-replay].has-failure-pin'))"
  // R24 short label + aligned step (handler sets runProgress step:2 max:3)
  const expectNext =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-failure-next-confirm][data-aligned-step=\"2\"]')&&document.querySelector('[data-testid=ai-pending-confirm][data-after-failure=\"1\"]')&&document.querySelector('[data-testid=ai-pending-agree]')&&/(下一步\\s*·\\s*2|Next\\s*·\\s*2)/.test((document.querySelector('[data-testid=ai-failure-next-confirm]')||{}).textContent||''))"
  return [
    {
      name: 'r25-failure-evidence',
      wait: 1400,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r25-failure-evidence-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence' }],
      expect: expectFail
    },
    {
      name: 'r25-failure-next-confirm',
      wait: 1500,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectNext
    },
    {
      name: 'r25-failure-next-confirm-narrow',
      narrow: true,
      wait: 1600,
      steps: [...open, { op: 'aiFailureEvidence', nextConfirm: 'systemctl restart nginx' }],
      expect: expectNext
    }
  ]
}
''',
    encoding="utf-8",
)
print("matrix: rewritten clean")

test = ROOT / "scripts/test-r25-ai-shot-harness.ts"
test.write_text(
    r'''/** R25: failure evidence matrix covers short 「下一步 · n」 next-confirm (wide+narrow). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r25AiShots, R25_AI_SHOT_NAMES } from './ai-shot-matrix-r25.mjs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'fail.nextConfirmStep', { n: 2 }), '下一步 · 2')
assert.equal(translate('en', 'fail.nextConfirmStep', { n: 2 }), 'Next · 2')

const shots = r25AiShots()
assert.deepEqual(shots.map((s) => s.name), R25_AI_SHOT_NAMES, 'matrix names stable')
assert.equal(R25_AI_SHOT_NAMES.length, 4)
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const wide = shots.find((s) => s.name === 'r25-failure-evidence')
assert.ok(wide)
assert.notEqual(wide?.narrow, true)
assert.ok(wide?.steps?.some((st) => st.op === 'aiFailureEvidence'))
assert.ok(wide?.expect?.includes('ai-failure-evidence'))

const narrow = shots.find((s) => s.name === 'r25-failure-evidence-narrow')
assert.equal(narrow?.narrow, true)

const linked = shots.find((s) => s.name === 'r25-failure-next-confirm')
assert.ok(linked?.steps?.some((st) => st.op === 'aiFailureEvidence' && st.nextConfirm))
assert.ok(linked?.expect?.includes('data-aligned-step'))
assert.ok(linked?.expect?.includes('下一步') || linked?.expect?.includes('Next'))
assert.ok(linked?.expect?.includes('ai-failure-next-confirm'))
assert.ok(linked?.expect?.includes('data-after-failure'))

const linkedN = shots.find((s) => s.name === 'r25-failure-next-confirm-narrow')
assert.equal(linkedN?.narrow, true)
assert.ok(linkedN?.expect?.includes('data-aligned-step'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("tg('fail.nextConfirmStep', { n: alignedPlan.step })"))
assert.ok(panel.includes('data-aligned-step={alignedPlan.step || undefined}'))
assert.ok(panel.includes("detail?.op === 'aiFailureEvidence'"))
assert.ok(panel.includes('shot-r22-next') || panel.includes('shot-r21-fail'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r25.mjs'"))
assert.ok(har.includes('r25AiShots()'))

const readme = norm('docs/screenshots/r25/README.md')
assert.ok(readme.includes('下一步 · n') || readme.includes('next-confirm'))
assert.ok(readme.includes('r25-failure-next-confirm-narrow'))

console.log('test-r25-ai-shot-harness: ok', R25_AI_SHOT_NAMES.length)
''',
    encoding="utf-8",
)
print("test: written")

readme = ROOT / "docs/screenshots/r25/README.md"
readme.write_text(
    """# Round 25 screenshots — failure evidence + short 「下一步 · n」

Captures the R21 failure evidence pin and R24 short next-confirm label via declarative op `aiFailureEvidence`.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r25-failure-evidence.png` | Failure pin wide | `ai-failure-evidence` + retry CTA + `has-failure-pin` |
| `*-r25-failure-evidence-narrow.png` | Failure pin narrow | same expects at narrow size |
| `*-r25-failure-next-confirm.png` | Failure + next dock | `ai-failure-next-confirm[data-aligned-step=2]` text `下一步 · 2` + Agree |
| `*-r25-failure-next-confirm-narrow.png` | Same, narrow | short label must not wrap poorly |

## Harness

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r25 --set chrome --only r25-failure-evidence,r25-failure-evidence-narrow,r25-failure-next-confirm,r25-failure-next-confirm-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r25 --no-build --set chrome --only r25-failure-evidence,r25-failure-evidence-narrow,r25-failure-next-confirm,r25-failure-next-confirm-narrow --themes dark,light
```
""",
    encoding="utf-8",
)
print("readme: written")

# Wire screenshot-key-screens.mjs
har = ROOT / "scripts/screenshot-key-screens.mjs"
h = har.read_text(encoding="utf-8")
if "ai-shot-matrix-r25.mjs" not in h:
    h = h.replace(
        "import { r22AiShots } from './ai-shot-matrix-r22.mjs'\n",
        "import { r22AiShots } from './ai-shot-matrix-r22.mjs'\nimport { r25AiShots } from './ai-shot-matrix-r25.mjs'\n",
        1,
    )
    old_block = """  // Round 22: R21 failure evidence pin (wide + narrow)
  ...${JSON.stringify(r22AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    new_block = """  // Round 22: R21 failure evidence pin (wide + narrow)
  ...${JSON.stringify(r22AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 25: failure evidence + short 「下一步 · n」 (wide + narrow)
  ...${JSON.stringify(r25AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    if old_block not in h:
        raise SystemExit("harness r22 block not found")
    h = h.replace(old_block, new_block, 1)
    har.write_text(h, encoding="utf-8")
    print("harness: wired r25")
else:
    print("harness: already")

# Wire package.json
pkg = ROOT / "package.json"
raw = pkg.read_text(encoding="utf-8")
needle = 'scripts/test-r24-next-confirm-short.ts"'
insert = 'scripts/test-r24-next-confirm-short.ts && npx tsx --tsconfig tsconfig.web.json scripts/test-r25-ai-shot-harness.ts"'
if "test-r25-ai-shot-harness" in raw:
    print("pkg: already")
elif needle not in raw:
    raise SystemExit("pkg needle missing")
else:
    pkg.write_text(raw.replace(needle, insert, 1), encoding="utf-8")
    print("pkg: wired")

print("item1 patch done")
