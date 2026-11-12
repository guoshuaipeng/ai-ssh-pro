# -*- coding: utf-8 -*-
"""R27 item2: seed matching audit before jumpAudit + r27 screenshot matrix."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

# --- screenshot-hooks type ---
hooks = ROOT / "src/renderer/src/lib/screenshot-hooks.ts"
h = hooks.read_text(encoding="utf-8")
old = '| { op: "aiMemoryEvidence"; goal?: string; hostFacts?: string[]; observations?: string[]; recentCommands?: string[]; open?: boolean; jumpAudit?: boolean }'
new = '| { op: "aiMemoryEvidence"; goal?: string; hostFacts?: string[]; observations?: string[]; recentCommands?: string[]; open?: boolean; jumpAudit?: boolean; seedAudit?: boolean }'
if "seedAudit?: boolean" not in h:
    if old not in h:
        raise SystemExit("hooks type missing")
    h = h.replace(old, new, 1)
    hooks.write_text(h, encoding="utf-8")
    print("hooks: seedAudit")
else:
    print("hooks: already")

# --- AIPanel jumpAudit seed ---
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel.read_text(encoding="utf-8")
# Ensure appendAudit already imported
if "import { appendAudit }" not in p and "appendAudit" not in p.split("from '@shared/audit-log'")[0][-200:]:
    # already used elsewhere — confirm
    if "appendAudit" not in p:
        raise SystemExit("appendAudit not in AIPanel")

needle = """        const jump = d.jumpAudit === true
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
"""

replacement = """        const jump = d.jumpAudit === true
        const wantOpen = jump ? false : d.open !== false
        setMemoryOpen(wantOpen)
        if (jump) {
          const cmd = view.items.find((it) => it.kind === 'recentCommand')
          const full = ((cmd?.query || cmd?.text) ?? '').trim()
          const host = conversation
            ? conversationLabel(conversation.hostLabel, conversation.n)
            : hostName || undefined
          // Round 27: seed a matching audit row so jump-audit shots show a hit,
          // not true-empty / filter-empty. Screenshot/QA only path (op handler).
          const seed = d.seedAudit !== false
          if (seed && full) {
            const hostKey = (host || hostName || 'demo').trim() || 'demo'
            appendAudit({
              type: 'command',
              host: hostKey,
              source: 'AI',
              outcome: 'allowed',
              detail: full,
              demo: true,
              tabNo: conversation?.n,
              policyChosen: 'ask',
              policyEffective: 'ask',
              policySource: 'temp'
            })
            window.dispatchEvent(new Event('aiss-audit-changed'))
          }
          window.dispatchEvent(
            new CustomEvent(OPEN_AUDIT_EVENT, {
              detail: { host: host || undefined, source: 'AI', type: 'command', text: full }
            })
          )
        }
"""

if "Round 27: seed a matching audit row" not in p:
    if needle not in p:
        raise SystemExit("jumpAudit block not found exactly")
    p = p.replace(needle, replacement, 1)
    # Also extend the typed detail
    old_type = """        const d = detail as {
          goal?: string
          hostFacts?: string[]
          observations?: string[]
          recentCommands?: string[]
          open?: boolean
          jumpAudit?: boolean
        }
"""
    new_type = """        const d = detail as {
          goal?: string
          hostFacts?: string[]
          observations?: string[]
          recentCommands?: string[]
          open?: boolean
          jumpAudit?: boolean
          seedAudit?: boolean
        }
"""
    if old_type not in p:
        raise SystemExit("detail type block missing")
    p = p.replace(old_type, new_type, 1)
    panel.write_text(p, encoding="utf-8")
    print("AIPanel: seed on jump")
else:
    print("AIPanel: already")

# --- matrix ---
matrix = ROOT / "scripts/ai-shot-matrix-r27.mjs"
matrix.write_text(
    r'''/** Round 27: full-page visual audit pass + seeded jump-audit hit state.
 * Builds on R26 memory matrix; jumpAudit now seeds a matching audit row.
 */
export const R27_AI_SHOT_NAMES = [
  'r27-jump-audit-hit',
  'r27-jump-audit-hit-narrow',
  'r27-failure-memory',
  'r27-failure-memory-narrow'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r27AiShots() {
  const openPanel = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const memPayload = {
    op: 'aiMemoryEvidence',
    goal: '排查 nginx 502',
    hostFacts: ['web-01 / 10.0.0.8'],
    observations: ['df：/ 使用 91%'],
    recentCommands: ['systemctl status nginx --no-pager'],
    jumpAudit: true,
    seedAudit: true
  }
  const expectHit =
    "!!(document.querySelector('[data-testid=audit-log]')&&document.querySelector('[data-testid=audit-table]')&&!document.querySelector('[data-testid=audit-empty]')&&!document.querySelector('[data-testid=audit-filter-empty]')&&/systemctl\\s+status\\s+nginx/.test((document.querySelector('.au2-search')||{}).value||'')&&((document.querySelector('[data-testid=audit-count]')||{}).textContent||'').match(/[1-9]/))"
  const expectFailMem =
    "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-memory-chip]')&&getComputedStyle(document.querySelector('[data-testid=ai-memory-chip]')).opacity!=='1')"
  return [
    {
      name: 'r27-jump-audit-hit',
      wait: 1800,
      steps: [...openPanel, { ...memPayload }],
      expect: expectHit
    },
    {
      name: 'r27-jump-audit-hit-narrow',
      narrow: true,
      wait: 1900,
      steps: [...openPanel, { ...memPayload }],
      expect: expectHit
    },
    {
      name: 'r27-failure-memory',
      wait: 1600,
      steps: [
        ...openPanel,
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect: expectFailMem
    },
    {
      name: 'r27-failure-memory-narrow',
      narrow: true,
      wait: 1700,
      steps: [
        ...openPanel,
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect: expectFailMem
    }
  ]
}
''',
    encoding="utf-8",
)
print("matrix written")

# --- harness import ---
har = ROOT / "scripts/screenshot-key-screens.mjs"
hs = har.read_text(encoding="utf-8")
if "r27AiShots" not in hs:
    if "from './ai-shot-matrix-r26.mjs'" not in hs:
        raise SystemExit("r26 import missing")
    hs = hs.replace(
        "import { r26AiShots } from './ai-shot-matrix-r26.mjs'\n",
        "import { r26AiShots } from './ai-shot-matrix-r26.mjs'\nimport { r27AiShots } from './ai-shot-matrix-r27.mjs'\n",
        1,
    )
    # Append r27 shots after r26 block inside chrome array
    old_tail = """  // Round 26: memory expand open/collapse + recent-cmd→audit jump
  ...${JSON.stringify(r26AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    new_tail = """  // Round 26: memory expand open/collapse + recent-cmd→audit jump
  ...${JSON.stringify(r26AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 27: seeded jump-audit hit + failure/memory hierarchy
  ...${JSON.stringify(r27AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    if old_tail not in hs:
        raise SystemExit("r26 chrome tail missing")
    hs = hs.replace(old_tail, new_tail, 1)
    har.write_text(hs, encoding="utf-8")
    print("harness: r27 wired")
else:
    print("harness: already")

# --- test ---
(ROOT / "scripts/test-r27-seed-jump-audit.ts").write_text(
    """/** R27 polish: jumpAudit seeds matching audit row; matrix expects hit not empty. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r27AiShots, R27_AI_SHOT_NAMES } from './ai-shot-matrix-r27.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

const shots = r27AiShots()
assert.deepEqual(shots.map((s) => s.name), R27_AI_SHOT_NAMES)
assert.equal(R27_AI_SHOT_NAMES.length, 4)

const hit = shots.find((s) => s.name === 'r27-jump-audit-hit')
assert.ok(hit)
assert.ok(hit?.steps?.some((st) => st.op === 'aiMemoryEvidence' && st.jumpAudit === true && st.seedAudit === true))
assert.ok(hit?.expect?.includes('audit-table'))
assert.ok(hit?.expect?.includes('audit-empty'))
assert.ok(hit?.expect?.includes('audit-filter-empty'))
assert.ok(hit?.expect?.includes('systemctl'))

const hitN = shots.find((s) => s.name === 'r27-jump-audit-hit-narrow')
assert.equal(hitN?.narrow, true)

const fail = shots.find((s) => s.name === 'r27-failure-memory')
assert.ok(fail?.steps?.some((st) => st.op === 'aiFailureEvidence' && st.withMemory === true))
assert.ok(fail?.expect?.includes('ai-failure-evidence'))
assert.ok(fail?.expect?.includes('ai-memory-chip'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('Round 27: seed a matching audit row'))
assert.ok(panel.includes('seedAudit'))
assert.ok(panel.includes("appendAudit({"))
assert.ok(panel.includes("aiss-audit-changed"))
assert.ok(panel.includes('demo: true'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('seedAudit?: boolean'))

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r27.mjs'"))
assert.ok(har.includes('r27AiShots()'))

const readme = norm('docs/screenshots/r27/README.md')
assert.ok(readme.includes('jump-audit-hit'))
assert.ok(readme.includes('failure-memory'))
assert.ok(readme.includes('seedAudit'))

console.log('test-r27-seed-jump-audit: ok', R27_AI_SHOT_NAMES.length)
""",
    encoding="utf-8",
)
print("test-r27-seed written")

# README
(ROOT / "docs/screenshots/r27").mkdir(parents=True, exist_ok=True)
(ROOT / "docs/screenshots/r27/README.md").write_text(
    """# Round 27 screenshots — seeded jump-audit hit + failure/memory hierarchy

Full-page visual audit follow-through: jump-audit must show a **matching row**, not true-empty / filter-empty.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r27-jump-audit-hit.png` | Seeded audit + jump | `audit-table`, not empty/filter-empty; search = recent cmd |
| `*-r27-jump-audit-hit-narrow.png` | Same, narrow | |
| `*-r27-failure-memory.png` | Failure pin + memory chip | memory muted (`opacity` demoted) |
| `*-r27-failure-memory-narrow.png` | Same, narrow | |

Op: `aiMemoryEvidence` with `jumpAudit: true` (default `seedAudit: true`) appends a matching AI command audit row before `OPEN_AUDIT`.

## Harness

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r27 --set chrome --only r27-jump-audit-hit,r27-jump-audit-hit-narrow,r27-failure-memory,r27-failure-memory-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r27 --no-build --set chrome --only r27-jump-audit-hit,r27-jump-audit-hit-narrow,r27-failure-memory,r27-failure-memory-narrow --themes dark,light
```
""",
    encoding="utf-8",
)
print("readme ok")

# Wire package.json
pkg = ROOT / "package.json"
raw = pkg.read_text(encoding="utf-8")
if "test-r27-seed-jump-audit" not in raw:
    anchor = "scripts/test-r27-visual-audit-touch.ts"
    if anchor not in raw:
        raise SystemExit("touch test not in package.json")
    raw = raw.replace(
        anchor,
        anchor
        + " && npx tsx --tsconfig tsconfig.node.json scripts/test-r27-seed-jump-audit.ts",
        1,
    )
    pkg.write_text(raw, encoding="utf-8")
    print("package: seed test wired")
else:
    print("package: already")
