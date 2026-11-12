# -*- coding: utf-8 -*-
"""R31 item1 pass2: empty-config ref, App wire, CSS, matrix, tests."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = panel_path.read_text(encoding="utf-8")

# Add ref mirroring screenshotEmptyConfig
if "screenshotEmptyConfigRef" not in pt:
    old = "  const [screenshotEmptyConfig, setScreenshotEmptyConfig] = useState(false)\n  const [screenshotModelMissing, setScreenshotModelMissing] = useState(false)"
    new = (
        "  const [screenshotEmptyConfig, setScreenshotEmptyConfig] = useState(false)\n"
        "  const [screenshotModelMissing, setScreenshotModelMissing] = useState(false)\n"
        "  const screenshotEmptyConfigRef = useRef(false)"
    )
    assert old in pt
    pt = pt.replace(old, new, 1)
    print("ref decl: ok")

# Sync ref whenever we set empty config in handlers — patch setScreenshotEmptyConfig calls in shot handlers
# Simpler: wrap by assigning ref in the two places we set true/false in new handlers, and clear sites.

def add_ref_sync(text: str) -> str:
    # After setScreenshotEmptyConfig(true/false) add matching ref
    text = text.replace(
        "setScreenshotEmptyConfig(true)\n        setScreenshotModelMissing(false)\n        setHasApiKey(false)",
        "setScreenshotEmptyConfig(true)\n        screenshotEmptyConfigRef.current = true\n        setScreenshotModelMissing(false)\n        setHasApiKey(false)",
    )
    # generic false clears — many places
    text = text.replace(
        "setScreenshotEmptyConfig(false)\n        setScreenshotModelMissing(false)",
        "setScreenshotEmptyConfig(false)\n        screenshotEmptyConfigRef.current = false\n        setScreenshotModelMissing(false)",
    )
    return text

pt2 = add_ref_sync(pt)
if pt2 != pt:
    pt = pt2
    print("ref sync: ok")
else:
    print("ref sync: no changes?")

# Refresh effect uses ref
old_ready = "        const ready = (p ? hasUsableKey(p.baseURL, p.apiKey) : false) || screenshotForceKeyRef.current\n        setHasApiKey(ready)"
new_ready = (
    "        const ready = screenshotEmptyConfigRef.current\n"
    "          ? false\n"
    "          : (p ? hasUsableKey(p.baseURL, p.apiKey) : false) || screenshotForceKeyRef.current\n"
    "        setHasApiKey(ready)"
)
if "screenshotEmptyConfigRef.current" not in pt[pt.find("const refresh"):pt.find("aiss-ai-settings-saved")]:
    assert old_ready in pt, "ready needle missing"
    pt = pt.replace(old_ready, new_ready, 1)
    print("refresh ready: ok")
else:
    print("refresh ready: already")

panel_path.write_text(pt, encoding="utf-8")
print("panel pass2 written")

# --- App.tsx ---
app_path = ROOT / "src/renderer/src/App.tsx"
at = app_path.read_text(encoding="utf-8")
if "aiEmptyConfig" not in at:
    old = "        detail.op === 'aiMemoryEvidence' || detail.op === 'aiFailureEvidence'"
    new = (
        "        detail.op === 'aiMemoryEvidence' || detail.op === 'aiFailureEvidence' ||\n"
        "        detail.op === 'aiEmptyConfig' || detail.op === 'aiModelMissing' ||\n"
        "        detail.op === 'aiReadonlyBanner'"
    )
    assert old in at
    at = at.replace(old, new, 1)
    app_path.write_text(at, encoding="utf-8")
    print("App: ok")
else:
    print("App: already")

# --- CSS narrow wrap for empty/error/model-missing ---
feat = ROOT / "src/renderer/src/features.css"
ft = feat.read_text(encoding="utf-8")
marker = "/* R31 Round31: H08 empty/error narrow wrap */"
if marker not in ft:
    block = """
/* R31 Round31: H08 empty/error narrow wrap */
.ai-empty-state {
  container-type: inline-size;
  min-width: 0;
}
.ai-config-card {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.ai-config-title {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.ai-config-actions {
  flex-wrap: wrap;
  justify-content: center;
  max-width: 100%;
}
.ai-config-note {
  max-width: min(280px, 100%);
  overflow-wrap: anywhere;
}
@container (max-width: 280px) {
  .ai-config-card {
    padding: 20px 10px;
    gap: 6px;
  }
  .ai-config-mark {
    font-size: 36px;
  }
  .ai-config-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .ai-config-actions .link-btn {
    text-align: center;
  }
}
"""
    # append after ai-empty-state rule
    needle = ".ai-empty-state { display: flex; flex-direction: column; min-height: 100%; }\n"
    assert needle in ft
    ft = ft.replace(needle, needle + block, 1)
    feat.write_text(ft, encoding="utf-8")
    print("features.css: ok")
else:
    print("features.css: already")

styles = ROOT / "src/renderer/src/styles.css"
st = styles.read_text(encoding="utf-8")
smarker = "/* R31 Round31: model-missing + error CTA narrow */"
if smarker not in st:
    # after .ai-model-missing-text block
    needle = """.ai-model-missing-text {
  flex: 1 1 140px;
  min-width: 0;
}
"""
    block = needle + """
/* R31 Round31: model-missing + error CTA narrow */
.ai-model-missing {
  min-width: 0;
  container-type: inline-size;
}
.ai-model-missing-text {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.ai-panel .ai-card-error .ai-reply-actions {
  max-width: 100%;
}
.ai-panel .ai-card-error .ai-reply-desc {
  overflow-wrap: anywhere;
  word-break: break-word;
  min-width: 0;
}
@container (max-width: 280px) {
  .ai-model-missing {
    align-items: stretch;
  }
  .ai-model-missing-text {
    flex: 1 1 100%;
  }
  .ai-model-missing [data-testid="ai-model-missing-settings"] {
    align-self: stretch;
    width: 100%;
  }
  .ai-panel .ai-card-error .ai-reply-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .ai-panel .ai-card-error .ai-fill-cmd-btn {
    width: 100%;
    justify-content: center;
  }
}
"""
    assert needle in st, "model-missing-text needle missing"
    st = st.replace(needle, block, 1)
    styles.write_text(st, encoding="utf-8")
    print("styles.css: ok")
else:
    print("styles.css: already")

# --- matrix ---
matrix = ROOT / "scripts/ai-shot-matrix-r31.mjs"
matrix.write_text("""/** Round 31: H08 empty / model-missing / HTTP error CTAs (narrow-first). */
export const R31_AI_SHOT_NAMES = [
  'r31-empty',
  'r31-empty-narrow',
  'r31-model-missing',
  'r31-model-missing-narrow',
  'r31-error-settings-narrow',
  'r31-error-retry-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r31AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const expectEmpty =
    "!!(document.querySelector('[data-testid=ai-empty-state]')&&document.querySelector('[data-testid=ai-config-setup]')&&!document.querySelector('[data-testid=ai-model-missing]')&&!document.querySelector('[data-card=error]'))"
  const expectMissing =
    "!!(document.querySelector('[data-testid=ai-model-missing]')&&document.querySelector('[data-testid=ai-model-missing-settings]')&&!document.querySelector('[data-testid=ai-empty-state]')&&!document.querySelector('[data-testid=ai-prod-auto-banner]')&&!document.querySelector('[data-testid=ai-readonly-banner]'))"
  const expectErrSettings =
    "!!(document.querySelector('[data-card=error]')&&document.querySelector('[data-testid=ai-error-open-settings]')&&document.querySelector('[data-card=error]').getAttribute('data-primary')==='settings')"
  const expectErrRetry =
    "!!(document.querySelector('[data-card=error]')&&document.querySelector('[data-testid=ai-error-retry]')&&document.querySelector('[data-card=error]').getAttribute('data-primary')==='retry')"
  return [
    {
      name: 'r31-empty',
      wait: 1400,
      steps: [...open, { op: 'aiEmptyConfig' }],
      expect: expectEmpty
    },
    {
      name: 'r31-empty-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiEmptyConfig' }],
      expect: expectEmpty
    },
    {
      name: 'r31-model-missing',
      wait: 1400,
      steps: [...open, { op: 'aiModelMissing' }],
      expect: expectMissing
    },
    {
      name: 'r31-model-missing-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiModelMissing' }],
      expect: expectMissing
    },
    {
      name: 'r31-error-settings-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'http_401', message: '未授权：请检查 API Key。' }],
      expect: expectErrSettings
    },
    {
      name: 'r31-error-retry-narrow',
      narrow: true,
      wait: 1500,
      steps: [...open, { op: 'aiError', errorCode: 'http_429', message: '请求过于频繁，请稍后重试。' }],
      expect: expectErrRetry
    }
  ]
}
""", encoding="utf-8")
print("matrix: ok")

# Wire harness
har = ROOT / "scripts/screenshot-key-screens.mjs"
ht = har.read_text(encoding="utf-8")
if "ai-shot-matrix-r31.mjs" not in ht:
    ht = ht.replace(
        "import { r30AiShots } from './ai-shot-matrix-r30.mjs'",
        "import { r30AiShots } from './ai-shot-matrix-r30.mjs'\nimport { r31AiShots } from './ai-shot-matrix-r31.mjs'",
        1,
    )
    old = """  // Round 30: prod↔readonly contrast (visual audit)
  ...${JSON.stringify(r30AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    new = """  // Round 30: prod↔readonly contrast (visual audit)
  ...${JSON.stringify(r30AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 31: H08 empty / model-missing / error CTAs (narrow-first)
  ...${JSON.stringify(r31AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    assert old in ht, "harness r30 block missing"
    ht = ht.replace(old, new, 1)
    har.write_text(ht, encoding="utf-8")
    print("harness: ok")
else:
    print("harness: already")

# README
readme = ROOT / "docs/screenshots/r31/README.md"
readme.write_text("""# Round 31 screenshots — H08 empty / error narrow matrix

Narrow-first visual QA for empty config, model-missing, and HTTP error primary CTAs.

| File | State | Expect |
|------|-------|--------|
| `*-r31-empty.png` | needs_config empty | `ai-empty-state` + `ai-config-setup`; no model-missing / error |
| `*-r31-empty-narrow.png` | Same @ 960×760 | actions wrap; title readable |
| `*-r31-model-missing.png` | key ok, no model | `ai-model-missing` + settings CTA; **no** host banners |
| `*-r31-model-missing-narrow.png` | Same narrow | text wraps; CTA full-width ≤280px |
| `*-r31-error-settings-narrow.png` | `http_401` | `data-primary=settings` |
| `*-r31-error-retry-narrow.png` | `http_429` | `data-primary=retry` |

Ops: `aiEmptyConfig` / `aiModelMissing` / `aiError`.

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r31 --set chrome --only r31-empty,r31-empty-narrow,r31-model-missing,r31-model-missing-narrow,r31-error-settings-narrow,r31-error-retry-narrow --themes dark,light
```
""", encoding="utf-8")
print("readme: ok")

# Guard test
(ROOT / "scripts/test-r31-empty-error-shots.ts").write_text("""/** R31: H08 empty/error narrow screenshot matrix wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r31AiShots, R31_AI_SHOT_NAMES } from './ai-shot-matrix-r31.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const shots = r31AiShots()
assert.deepEqual(shots.map((s) => s.name), R31_AI_SHOT_NAMES)
assert.equal(R31_AI_SHOT_NAMES.length, 6)

const emptyN = shots.find((s) => s.name === 'r31-empty-narrow')
assert.equal(emptyN?.narrow, true)
assert.ok(emptyN?.steps?.some((st) => st.op === 'aiEmptyConfig'))
assert.ok(emptyN?.expect?.includes('ai-empty-state'))
assert.ok(emptyN?.expect?.includes('ai-config-setup'))

const missN = shots.find((s) => s.name === 'r31-model-missing-narrow')
assert.equal(missN?.narrow, true)
assert.ok(missN?.steps?.some((st) => st.op === 'aiModelMissing'))
assert.ok(missN?.expect?.includes('ai-model-missing'))
assert.ok(missN?.expect?.includes('ai-prod-auto-banner'))

const errS = shots.find((s) => s.name === 'r31-error-settings-narrow')
assert.ok(errS?.steps?.some((st) => st.op === 'aiError' && st.errorCode === 'http_401'))
assert.ok(errS?.expect?.includes("data-primary")==='settings'" in (errS?.expect || '') or True)
assert.ok(errS?.expect?.includes(\"settings\"))

const errR = shots.find((s) => s.name === 'r31-error-retry-narrow')
assert.ok(errR?.steps?.some((st) => st.op === 'aiError' && st.errorCode === 'http_429'))
assert.ok(errR?.expect?.includes('retry'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiEmptyConfig'))
assert.ok(hooks.includes('aiModelMissing'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes(\"detail?.op === 'aiEmptyConfig'\"))
assert.ok(panel.includes(\"detail?.op === 'aiModelMissing'\"))
assert.ok(panel.includes('screenshotEmptyConfig'))
assert.ok(panel.includes('screenshotModelMissing'))
assert.ok(panel.includes('screenshotEmptyConfigRef'))

const feat = norm('src/renderer/src/features.css')
assert.ok(feat.includes('R31 Round31: H08 empty/error narrow wrap'))
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(feat[feat.indexOf('R31 Round31'): feat.indexOf('R31 Round31') + 900]), false)

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R31 Round31: model-missing + error CTA narrow'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes(\"from './ai-shot-matrix-r31.mjs'\"))
assert.ok(har.includes('r31AiShots()'))

const readme = norm('docs/screenshots/r31/README.md')
assert.ok(readme.includes('aiEmptyConfig'))
assert.ok(readme.includes('aiModelMissing'))

console.log('test-r31-empty-error-shots: ok', R31_AI_SHOT_NAMES.length)
""", encoding="utf-8")
print("test written — fixing assert typo next")
