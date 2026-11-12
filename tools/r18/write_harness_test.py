# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

(ROOT / "scripts" / "test-r18-ai-shot-harness.ts").write_text(
    r'''/** R18: plan-step-align + audit↔dialog deep-link screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r18AiShots, R18_AI_SHOT_NAMES } from './ai-shot-matrix-r18.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r18AiShots()
assert.deepEqual(shots.map((s) => s.name), R18_AI_SHOT_NAMES, 'matrix names stable')
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
for (const op of ['aiPlanStepAlign', 'aiExecAuditLink', 'aiAuditFocus']) {
  assert.ok(hooks.includes(op), op + ' typed')
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
for (const op of ['aiPlanStepAlign', 'aiExecAuditLink', 'aiAuditFocus']) {
  assert.ok(panel.includes("detail?.op === '" + op + "'"), 'AIPanel handles ' + op)
}
assert.ok(panel.includes('screenshotAuditFocusId'))
assert.ok(panel.includes('shot-r18-align'))
assert.ok(panel.includes('aud-r18-link') || panel.includes('aud-r18-focus'))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiPlanStepAlign'"))
assert.ok(app.includes("detail.op === 'aiExecAuditLink'"))
assert.ok(app.includes("detail.op === 'aiAuditFocus'"))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r18.mjs'"))
assert.ok(har.includes('r18AiShots()'))

const align = shots.find((s) => s.name === 'r18-plan-step-align')
assert.ok(align?.expect?.includes('data-aligned-step'))
const openAi = shots.find((s) => s.name === 'r18-audit-open-ai')
assert.ok(openAi?.steps?.some((st) => st.op === 'menu' && st.action === 'auditLog'))

console.log('test-r18-ai-shot-harness: ok', R18_AI_SHOT_NAMES.length)
''',
    encoding="utf-8",
)

readme = ROOT / "docs" / "screenshots" / "r18"
readme.mkdir(parents=True, exist_ok=True)
(readme / "README.md").write_text(
    """# Round 18 screenshots — plan-step align + audit↔dialog

Extends the Electron AI harness with R18 deep-link / step-align states.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r18-plan-step-align.png` | Aligned plan steps | chip `data-aligned-step=2` + badge + `ai-step-index` agree (runProgress intentionally 7) |
| `*-r18-ai-to-audit.png` | AI → 审计 | `ai-exec-audit` jump button on ExecReplay |
| `*-r18-audit-to-ai.png` | 审计 → AI | card `is-audit-focus` / `data-audit-focus=1` |
| `*-r18-audit-open-ai.png` | 审计表「对话」 | `audit-open-ai` on AI-sourced rows |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r18.mjs` (ops `aiPlanStepAlign`, `aiExecAuditLink`, `aiAuditFocus` + auditLog menu).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r18 --set chrome --only r18-plan-step-align,r18-ai-to-audit,r18-audit-to-ai,r18-audit-open-ai --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r18 --no-build --set chrome --only r18-plan-step-align,r18-ai-to-audit,r18-audit-to-ai,r18-audit-open-ai --themes dark,light
```
""",
    encoding="utf-8",
)

# package.json
pkg = ROOT / "package.json"
pt = pkg.read_text(encoding="utf-8")
needle = "npx tsx --tsconfig tsconfig.node.json scripts/test-r18-plan-step-align.ts"
ins = needle + " && npx tsx --tsconfig tsconfig.node.json scripts/test-r18-ai-shot-harness.ts"
if "test-r18-ai-shot-harness" in pt:
    print("package already has harness test")
elif needle not in pt:
    raise SystemExit("package needle missing")
else:
    pkg.write_text(pt.replace(needle, ins, 1), encoding="utf-8")
    print("package.json updated")

print("test + README written")
