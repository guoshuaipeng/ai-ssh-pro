# -*- coding: utf-8 -*-
"""R33: matrix, harness, tests, package wire, README."""
from pathlib import Path
import json

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

matrix = ROOT / "scripts/ai-shot-matrix-r33.mjs"
matrix.write_text(r'''/** Round 33: every-3 visual audit — miss→New chat toast + EN Ask chip. */
export const R33_AI_SHOT_NAMES = [
  'r33-miss-toast',
  'r33-miss-toast-narrow',
  'r33-en-ask-chip',
  'r33-en-ask-chip-narrow',
  'r33-en-ask-pop',
  'r33-en-ask-pop-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,toasts?:boolean,steps:Array<object>,expect?:string}>} */
export function r33AiShots() {
  const openZh = [
    { op: 'locale', id: 'zh-CN' },
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const openEn = [
    { op: 'locale', id: 'en' },
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectMiss =
    "!!(document.querySelector('[data-testid=toast]')&&document.querySelector('[data-testid=toast-action]')&&(document.querySelector('[data-testid=toast-action]').textContent||'').includes('新开对话')&&(document.querySelector('[data-testid=toast]').textContent||'').includes('新开对话'))"
  const expectAsk =
    "!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()==='Ask')"
  const expectAskPop =
    "!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()==='Ask'&&document.querySelector('[data-testid=ai-safety-pop]'))"
  return [
    {
      name: 'r33-miss-toast',
      toasts: true,
      wait: 1600,
      steps: [...openZh, { op: 'aiMissToast' }],
      expect: expectMiss
    },
    {
      name: 'r33-miss-toast-narrow',
      narrow: true,
      toasts: true,
      wait: 1700,
      steps: [...openZh, { op: 'aiMissToast' }],
      expect: expectMiss
    },
    {
      name: 'r33-en-ask-chip',
      wait: 1500,
      steps: [...openEn],
      expect: expectAsk
    },
    {
      name: 'r33-en-ask-chip-narrow',
      narrow: true,
      wait: 1600,
      steps: [...openEn],
      expect: expectAsk
    },
    {
      name: 'r33-en-ask-pop',
      wait: 1600,
      steps: [...openEn, { op: 'aiComposerPop', which: 'safety' }],
      expect: expectAskPop
    },
    {
      name: 'r33-en-ask-pop-narrow',
      narrow: true,
      wait: 1700,
      steps: [...openEn, { op: 'aiComposerPop', which: 'safety' }],
      expect: expectAskPop
    }
  ]
}
''', encoding="utf-8", newline="\n")
print("matrix ok")

# harness import + merge
har_path = ROOT / "scripts/screenshot-key-screens.mjs"
har = har_path.read_text(encoding="utf-8")
if "ai-shot-matrix-r33" not in har:
    har = har.replace(
        "import { r31AiShots } from './ai-shot-matrix-r31.mjs'\n",
        "import { r31AiShots } from './ai-shot-matrix-r31.mjs'\nimport { r33AiShots } from './ai-shot-matrix-r33.mjs'\n",
        1,
    )
    # map after r31
    old = """  ...${JSON.stringify(r31AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    new = """  ...${JSON.stringify(r31AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 33: miss→New chat toast + EN Ask chip (every-3 visual audit)
  ...${JSON.stringify(r33AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    toasts: !!s.toasts,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    if old not in har:
        raise SystemExit("r31 map block not found for harness splice")
    har = har.replace(old, new, 1)
    har_path.write_text(har, encoding="utf-8", newline="\n")
    print("harness ok")
else:
    print("harness already")

# test-r33-miss-en-chip-shots.ts
(ROOT / "scripts/test-r33-miss-en-chip-shots.ts").write_text("""/** R33: miss toast + EN Ask chip screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r33AiShots, R33_AI_SHOT_NAMES } from './ai-shot-matrix-r33.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const shots = r33AiShots()
assert.deepEqual(shots.map((s) => s.name), R33_AI_SHOT_NAMES)
assert.equal(R33_AI_SHOT_NAMES.length, 6)

const miss = shots.find((s) => s.name === 'r33-miss-toast')
assert.equal(miss?.toasts, true)
assert.ok(miss?.steps?.some((st) => st.op === 'aiMissToast'))
assert.ok(miss?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'zh-CN'))
assert.ok(miss?.expect?.includes('toast-action'))
assert.ok(miss?.expect?.includes('新开对话'))

const missN = shots.find((s) => s.name === 'r33-miss-toast-narrow')
assert.equal(missN?.narrow, true)
assert.equal(missN?.toasts, true)

const en = shots.find((s) => s.name === 'r33-en-ask-chip')
assert.ok(en?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'en'))
assert.ok(en?.expect?.includes(\"'Ask'\"))

const enN = shots.find((s) => s.name === 'r33-en-ask-chip-narrow')
assert.equal(enN?.narrow, true)

const pop = shots.find((s) => s.name === 'r33-en-ask-pop')
assert.ok(pop?.steps?.some((st) => st.op === 'aiComposerPop'))
assert.ok(pop?.expect?.includes('ai-safety-pop'))

const popN = shots.find((s) => s.name === 'r33-en-ask-pop-narrow')
assert.equal(popN?.narrow, true)

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiMissToast'))
assert.ok(hooks.includes('op: \"locale\"') || hooks.includes(\"op: 'locale'\") || hooks.includes('op: \"locale\"'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes(\"detail?.op === 'aiMissToast'\"))
assert.ok(panel.includes('Round 33: calm miss toast'))
assert.ok(panel.includes('buildAuditOpenAiMissToast'))
assert.ok(panel.includes('startNewChatRef.current?.()'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes(\"detail.op === 'locale'\"))
assert.ok(app.includes(\"detail.op === 'aiMissToast'\"))
assert.ok(app.includes('setLocale'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes(\"from './ai-shot-matrix-r33.mjs'\"))
assert.ok(har.includes('r33AiShots()'))
assert.ok(har.includes('toasts: !!s.toasts'))

const readme = norm('docs/screenshots/r33/README.md')
assert.ok(readme.includes('aiMissToast'))
assert.ok(readme.includes('Ask'))
assert.ok(readme.includes('locale'))

const pkg = norm('package.json')
assert.ok(pkg.includes('test-r31-empty-error-shots'))
assert.ok(pkg.includes('test-r32-audit-miss-new-chat'))
assert.ok(pkg.includes('test-r33-visual-audit-toast'))
assert.ok(pkg.includes('test-r33-miss-en-chip-shots'))

console.log('test-r33-miss-en-chip-shots: ok', R33_AI_SHOT_NAMES.length)
""", encoding="utf-8", newline="\n")
print("test2 ok")

# README
shot_dir = ROOT / "docs/screenshots/r33"
shot_dir.mkdir(parents=True, exist_ok=True)
(shot_dir / "README.md").write_text("""# Round 33 screenshots — miss→New chat + EN Ask chip

Every-3 full-page visual audit deliverable: R32 surfaces that previously lacked a matrix.

| File | State | Expect |
|------|-------|--------|
| `*-r33-miss-toast.png` | zh-CN + `aiMissToast` (`toasts: true`) | info toast + action 新开对话 |
| `*-r33-miss-toast-narrow.png` | Same, narrow | message wraps; action stays |
| `*-r33-en-ask-chip.png` | `locale:en` + AI chat | chip label **Ask** (not Confirm) |
| `*-r33-en-ask-chip-narrow.png` | Same, narrow | ellipsis calm |
| `*-r33-en-ask-pop.png` | EN + `aiComposerPop` safety | Ask chip + open menu |
| `*-r33-en-ask-pop-narrow.png` | Same, narrow | menu readable |

Ops: `locale` (`en`\\|`zh-CN`), `aiMissToast`.

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r33 --set chrome --only r33-miss-toast,r33-miss-toast-narrow,r33-en-ask-chip,r33-en-ask-chip-narrow,r33-en-ask-pop,r33-en-ask-pop-narrow --themes dark,light
```
""", encoding="utf-8", newline="\n")
print("readme ok")

# package.json wire R31, R32, R33 after r30-contrast
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
parts = pkg["scripts"]["test:parts"]
needle = "npx tsx --tsconfig tsconfig.node.json scripts/test-r30-contrast-shots.ts"
extra = (
    needle
    + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r31-empty-error-shots.ts"
    + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r31-model-missing-banner.ts"
    + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r32-audit-miss-new-chat.ts"
    + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r32-en-policy-chip.ts"
    + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r33-visual-audit-toast.ts"
    + " && npx tsx --tsconfig tsconfig.node.json scripts/test-r33-miss-en-chip-shots.ts"
)
if "test-r33-miss-en-chip-shots" not in parts:
    if needle not in parts:
        raise SystemExit("r30-contrast anchor missing in test:parts")
    parts = parts.replace(needle, extra, 1)
    pkg["scripts"]["test:parts"] = parts
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print("package.json wired")
else:
    print("package already wired")

print("item2 files done")
