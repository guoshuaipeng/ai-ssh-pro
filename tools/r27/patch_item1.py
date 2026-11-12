# -*- coding: utf-8 -*-
"""R27 item1: full-page visual audit quick P2 — memory touch hit ≥32px + audit test."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

css = ROOT / "src/renderer/src/styles.css"
c = css.read_text(encoding="utf-8")
marker = "/* R27 Round27: memory expand touch hit (visual audit P2) */"
if marker not in c:
    block = """
/* R27 Round27: memory expand touch hit (visual audit P2) */
.ai-panel .ai-memory-close {
  min-height: 32px;
}
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn {
  min-height: 32px;
}
.ai-panel .ai-memory-chip {
  min-height: 32px;
}

"""
    # Prefer insert before R26 hierarchy so newest round sits near memory styles
    anchor = "/* R26 Round26: failure pin + memory chip hierarchy */"
    if anchor not in c:
        raise SystemExit("R26 CSS anchor missing")
    c = c.replace(anchor, block + anchor, 1)
    # Guard: no token fallbacks in new block
    start = c.index(marker)
    end = c.index("/* R26 Round26:", start)
    chunk = c[start:end]
    if re.search(r"var\(--[^,)]+,\s*[^)]+\)", chunk):
        raise SystemExit("token fallback in R27 CSS")
    css.write_text(c, encoding="utf-8")
    print("css: touch hit 32px")
else:
    print("css: already")

# Test file
test = ROOT / "scripts/test-r27-visual-audit-touch.ts"
test.write_text("""/** R27: full-page visual audit quick P2 — memory touch targets ≥32px; no token fallbacks. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')
const css = norm('src/renderer/src/styles.css')

assert.ok(css.includes('R27 Round27: memory expand touch hit'))
const start = css.indexOf('R27 Round27: memory expand touch hit')
const end = css.indexOf('R26 Round26: failure pin + memory chip hierarchy', start)
assert.ok(end > start, 'R27 block before R26')
const block = css.slice(start, end)
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks in R27 CSS')
assert.ok(/\\.ai-memory-close\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(block))
assert.ok(/\\.ai-memory-jump-btn\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(block) || /is-jumpable \\.ai-memory-jump-btn\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(block))
assert.ok(/\\.ai-memory-chip\\s*\\{[\\s\\S]*?min-height:\\s*32px/.test(block))

// Design note + backlog table present
const design = norm('docs/design/r27-full-page-visual-audit.md')
assert.ok(design.includes('full-page visual audit'))
assert.ok(design.includes('seed matching'))
assert.ok(design.includes('min-height: 32px') || design.includes('bump to 32px'))

const backlog = norm('docs/backlog.md')
assert.ok(backlog.includes('Round 27 全页') || backlog.includes('Round 27 整页') || backlog.includes('Round 27 full-page') || backlog.includes('2026-11-05 Round 27'))

console.log('test-r27-visual-audit-touch: ok')
""", encoding="utf-8")
print("test written")

# Wire into package.json test:parts after test-r26-hierarchy if present
pkg = ROOT / "package.json"
raw = pkg.read_text(encoding="utf-8")
needle = "scripts/test-r26-hierarchy-audit-empty.ts"
add = " && npx tsx --tsconfig tsconfig.web.json scripts/test-r27-visual-audit-touch.ts"
if "test-r27-visual-audit-touch" not in raw:
    if needle not in raw:
        # fall back after test-r26-ai-shot-harness
        needle2 = "scripts/test-r26-ai-shot-harness.ts"
        if needle2 not in raw:
            raise SystemExit("package.json missing r26 tests")
        raw = raw.replace(
            'scripts/test-r26-ai-shot-harness.ts"',
            'scripts/test-r26-ai-shot-harness.ts"' + ' placeholder',
            1,
        )
        # careful: package.json values end with quote; insert before closing quote of test:parts is hard.
        # Instead splice after hierarchy or harness occurrence inside the long string.
        raise SystemExit("use hierarchy needle")
    raw = raw.replace(
        needle + '"',
        needle + add + '"',
        1,
    )
    # If hierarchy is not at end of string (followed by &&), replace differently
    if "test-r27-visual-audit-touch" not in raw:
        raw = pkg.read_text(encoding="utf-8")
        raw = raw.replace(
            needle,
            needle + add,
            1,
        )
    pkg.write_text(raw, encoding="utf-8")
    print("package.json: wired touch test")
else:
    print("package.json: already")
