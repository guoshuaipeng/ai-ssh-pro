# -*- coding: utf-8 -*-
"""R26 item1: memory expand states → screenshot matrix docs/screenshots/r26/."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

# --- matrix ---
matrix = ROOT / "scripts/ai-shot-matrix-r26.mjs"
matrix.write_text(
    r'''/** Round 26: working-memory expand states — open / collapse / recent-cmd→audit jump.
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 * Builds on R20 aiMemoryEvidence + R25 close/jump UX.
 */
export const R26_AI_SHOT_NAMES = [
  'r26-memory-open',
  'r26-memory-open-narrow',
  'r26-memory-collapsed',
  'r26-memory-collapsed-narrow',
  'r26-memory-jump-audit',
  'r26-memory-jump-audit-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r26AiShots() {
  const openPanel = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const memPayload = {
    op: 'aiMemoryEvidence',
    goal: '排查 nginx 502',
    hostFacts: ['web-01 / 10.0.0.8'],
    observations: ['df：/ 使用 91%'],
    recentCommands: ['systemctl status nginx --no-pager']
  }
  const expectOpen =
    "!!(document.querySelector('[data-testid=ai-memory-pop]')&&document.querySelector('[data-testid=ai-memory-close]')&&document.querySelector('[data-testid=ai-memory-jump-btn]')&&document.querySelector('[data-testid=ai-memory-chip].is-open')&&document.querySelector('[data-testid=ai-memory-jump-label], .ai-memory-jump-label'))"
  const expectCollapsed =
    "!!(document.querySelector('[data-testid=ai-memory-chip]')&&document.querySelector('[data-testid=ai-memory-chip]').getAttribute('aria-expanded')==='false'&&!document.querySelector('[data-testid=ai-memory-pop]')&&document.querySelector('[data-testid=ai-memory-count]'))"
  const expectJump =
    "!!(document.querySelector('[data-testid=audit-log]')&&document.querySelector('.au2-search')&&/systemctl\\s+status\\s+nginx/.test((document.querySelector('.au2-search')||{}).value||''))"
  return [
    {
      name: 'r26-memory-open',
      wait: 1400,
      steps: [...openPanel, { ...memPayload, open: true }],
      expect: expectOpen
    },
    {
      name: 'r26-memory-open-narrow',
      narrow: true,
      wait: 1500,
      steps: [...openPanel, { ...memPayload, open: true }],
      expect: expectOpen
    },
    {
      name: 'r26-memory-collapsed',
      wait: 1400,
      steps: [...openPanel, { ...memPayload, open: false }],
      expect: expectCollapsed
    },
    {
      name: 'r26-memory-collapsed-narrow',
      narrow: true,
      wait: 1500,
      steps: [...openPanel, { ...memPayload, open: false }],
      expect: expectCollapsed
    },
    {
      name: 'r26-memory-jump-audit',
      wait: 1600,
      steps: [...openPanel, { ...memPayload, jumpAudit: true }],
      expect: expectJump
    },
    {
      name: 'r26-memory-jump-audit-narrow',
      narrow: true,
      wait: 1700,
      steps: [...openPanel, { ...memPayload, jumpAudit: true }],
      expect: expectJump
    }
  ]
}
''',
    encoding="utf-8",
)
print("matrix: written")

# --- screenshot-hooks type ---
hooks = ROOT / "src/renderer/src/lib/screenshot-hooks.ts"
h = hooks.read_text(encoding="utf-8")
old = '  | { op: "aiMemoryEvidence"; goal?: string; hostFacts?: string[]; observations?: string[]; recentCommands?: string[] }'
new = '  | { op: "aiMemoryEvidence"; goal?: string; hostFacts?: string[]; observations?: string[]; recentCommands?: string[]; open?: boolean; jumpAudit?: boolean }'
if "jumpAudit?: boolean" not in h:
    if old not in h:
        raise SystemExit("hooks aiMemoryEvidence type missing")
    h = h.replace(old, new, 1)
    hooks.write_text(h, encoding="utf-8")
    print("hooks: open/jumpAudit ok")
else:
    print("hooks: already")

# --- AIPanel handler ---
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel.read_text(encoding="utf-8")
old_handler = """      if (detail?.op === 'aiMemoryEvidence') {
        screenshotForceKeyRef.current = true
        setHasApiKey(true)
        const d = detail as {
          goal?: string
          hostFacts?: string[]
          observations?: string[]
          recentCommands?: string[]
        }
        const view = buildMemoryEvidenceView({
          goal: d.goal ?? '排查 nginx 502',
          hostFacts: d.hostFacts ?? ['web-01 / 10.0.0.8'],
          observations: d.observations ?? ['df：/ 使用 91%', 'nginx inactive (dead)'],
          recentCommands: d.recentCommands ?? ['systemctl status nginx --no-pager']
        })
        setWorkingGoal(view.goal)
        setMemoryView(view)
        setMemoryOpen(true)
        return
      }
"""
new_handler = """      if (detail?.op === 'aiMemoryEvidence') {
        // Round 20 seed; Round 26: open/collapse + recent-cmd → audit jump for shot matrix.
        screenshotForceKeyRef.current = true
        clearShotAiOp()
        screenshotResumeLockRef.current = false
        setScreenshotProtectionOverride(null)
        setScreenshotAuditFocusId(null)
        setHasApiKey(true)
        setBusy(false)
        const d = detail as {
          goal?: string
          hostFacts?: string[]
          observations?: string[]
          recentCommands?: string[]
          open?: boolean
          jumpAudit?: boolean
        }
        const view = buildMemoryEvidenceView({
          goal: d.goal ?? '排查 nginx 502',
          hostFacts: d.hostFacts ?? ['web-01 / 10.0.0.8'],
          observations: d.observations ?? ['df：/ 使用 91%', 'nginx inactive (dead)'],
          recentCommands: d.recentCommands ?? ['systemctl status nginx --no-pager']
        })
        setWorkingGoal(view.goal)
        setMemoryView(view)
        const jump = d.jumpAudit === true
        const wantOpen = jump ? false : d.open !== false
        setMemoryOpen(wantOpen)
        if (jump) {
          const cmd = view.items.find((it) => it.kind === 'recentCommand')
          const full = ((cmd?.query || cmd?.text) ?? '').trim()
          const host = conversation
            ? conversationLabel(conversation.hostLabel, conversation.n)
            : hostName || undefined
          window.dispatchEvent(
            new CustomEvent(OPEN_AUDIT_EVENT, {
              detail: { host, source: 'AI', type: 'command', text: full }
            })
          )
        }
        return
      }
"""
if "jumpAudit === true" not in p:
    if old_handler not in p:
        raise SystemExit("AIPanel aiMemoryEvidence handler missing/changed")
    p = p.replace(old_handler, new_handler, 1)
    panel.write_text(p, encoding="utf-8")
    print("AIPanel: handler ok")
else:
    print("AIPanel: already")

# --- wire harness ---
har = ROOT / "scripts/screenshot-key-screens.mjs"
hs = har.read_text(encoding="utf-8")
if "ai-shot-matrix-r26.mjs" not in hs:
    hs = hs.replace(
        "import { r25AiShots } from './ai-shot-matrix-r25.mjs'\n",
        "import { r25AiShots } from './ai-shot-matrix-r25.mjs'\nimport { r26AiShots } from './ai-shot-matrix-r26.mjs'\n",
        1,
    )
    old_block = """  // Round 25: failure evidence + short 「下一步 · n」 (wide + narrow)
  ...${JSON.stringify(r25AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]
"""
    new_block = """  // Round 25: failure evidence + short 「下一步 · n」 (wide + narrow)
  ...${JSON.stringify(r25AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 26: memory expand open/collapse + recent-cmd→audit jump
  ...${JSON.stringify(r26AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]
"""
    if old_block not in hs:
        raise SystemExit("harness r25 block missing")
    hs = hs.replace(old_block, new_block, 1)
    har.write_text(hs, encoding="utf-8")
    print("harness: wired")
else:
    print("harness: already")

# --- test ---
test = ROOT / "scripts/test-r26-ai-shot-harness.ts"
test.write_text(
    r'''/** R26: memory expand open/collapse/jump-audit screenshot matrix wired. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r26AiShots, R26_AI_SHOT_NAMES } from './ai-shot-matrix-r26.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const shots = r26AiShots()
assert.deepEqual(shots.map((s) => s.name), R26_AI_SHOT_NAMES, 'matrix names stable')
assert.equal(R26_AI_SHOT_NAMES.length, 6)
assert.ok(shots.every((s) => Array.isArray(s.steps) && s.steps.length > 0))
assert.ok(shots.every((s) => typeof s.expect === 'string' && s.expect.length > 10))

const opened = shots.find((s) => s.name === 'r26-memory-open')
assert.ok(opened)
assert.notEqual(opened?.narrow, true)
assert.ok(opened?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.open === true))
assert.ok(opened?.expect?.includes('ai-memory-pop'))
assert.ok(opened?.expect?.includes('ai-memory-close'))
assert.ok(opened?.expect?.includes('ai-memory-jump-btn'))

const openedN = shots.find((s) => s.name === 'r26-memory-open-narrow')
assert.equal(openedN?.narrow, true)

const collapsed = shots.find((s) => s.name === 'r26-memory-collapsed')
assert.ok(collapsed?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.open === false))
assert.ok(collapsed?.expect?.includes("aria-expanded')==='false'") || collapsed?.expect?.includes('aria-expanded')==='false'))
assert.ok(collapsed?.expect?.includes('!document.querySelector(\'[data-testid=ai-memory-pop]\')') || collapsed?.expect?.includes('ai-memory-pop'))

const collapsedN = shots.find((s) => s.name === 'r26-memory-collapsed-narrow')
assert.equal(collapsedN?.narrow, true)

const jump = shots.find((s) => s.name === 'r26-memory-jump-audit')
assert.ok(jump?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.jumpAudit === true))
assert.ok(jump?.expect?.includes('audit-log'))
assert.ok(jump?.expect?.includes('au2-search'))
assert.ok(jump?.expect?.includes('systemctl'))

const jumpN = shots.find((s) => s.name === 'r26-memory-jump-audit-narrow')
assert.equal(jumpN?.narrow, true)
assert.ok(jumpN?.expect?.includes('audit-log'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('jumpAudit?: boolean'))
assert.ok(hooks.includes('open?: boolean'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("detail?.op === 'aiMemoryEvidence'"))
assert.ok(panel.includes('jumpAudit === true') || panel.includes('d.jumpAudit === true'))
assert.ok(panel.includes('OPEN_AUDIT_EVENT'))
assert.ok(panel.includes('wantOpen'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r26.mjs'"))
assert.ok(har.includes('r26AiShots()'))

const readme = norm('docs/screenshots/r26/README.md')
assert.ok(readme.includes('memory-open'))
assert.ok(readme.includes('memory-collapsed'))
assert.ok(readme.includes('memory-jump-audit'))

console.log('test-r26-ai-shot-harness: ok', R26_AI_SHOT_NAMES.length)
''',
    encoding="utf-8",
)
print("test: written")

# --- README ---
readme = ROOT / "docs/screenshots/r26/README.md"
readme.write_text(
    """# Round 26 screenshots — memory expand open / collapse / audit jump

Captures Round 25 working-memory expand UX via declarative op `aiMemoryEvidence` (`open`, `jumpAudit`).

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r26-memory-open.png` | Pop open | close + jump-btn + chip `.is-open` |
| `*-r26-memory-open-narrow.png` | Same, narrow | |
| `*-r26-memory-collapsed.png` | Chip only | `aria-expanded=false`, no pop |
| `*-r26-memory-collapsed-narrow.png` | Same, narrow | |
| `*-r26-memory-jump-audit.png` | After jump | audit panel + search = recent cmd |
| `*-r26-memory-jump-audit-narrow.png` | Same, narrow | |

## Harness

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r26 --set chrome --only r26-memory-open,r26-memory-open-narrow,r26-memory-collapsed,r26-memory-collapsed-narrow,r26-memory-jump-audit,r26-memory-jump-audit-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r26 --no-build --set chrome --only r26-memory-open,r26-memory-open-narrow,r26-memory-collapsed,r26-memory-collapsed-narrow,r26-memory-jump-audit,r26-memory-jump-audit-narrow --themes dark,light
```
""",
    encoding="utf-8",
)
print("readme: written")
print("item1 patch done")
