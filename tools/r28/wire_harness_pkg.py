from pathlib import Path

har = Path("scripts/screenshot-key-screens.mjs")
t = har.read_text(encoding="utf-8")
if "ai-shot-matrix-r28" not in t:
    t = t.replace(
        "import { r27AiShots } from './ai-shot-matrix-r27.mjs'\n",
        "import { r27AiShots } from './ai-shot-matrix-r27.mjs'\nimport { r28AiShots } from './ai-shot-matrix-r28.mjs'\n",
        1,
    )
    inject = """  // Round 27: seeded jump-audit hit + failure/memory hierarchy
  ...${JSON.stringify(r27AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    inject_new = """  // Round 27: seeded jump-audit hit + failure/memory hierarchy
  ...${JSON.stringify(r27AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 28: audit filter-empty + pending Decline demoted
  ...${JSON.stringify(r28AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    assert inject in t, "r27 inject anchor missing"
    t = t.replace(inject, inject_new, 1)
    har.write_text(t, encoding="utf-8")
    print("harness wired")
else:
    print("harness already")

pkg = Path("package.json")
pt = pkg.read_text(encoding="utf-8")
needle = 'npx tsx --tsconfig tsconfig.node.json scripts/test-r27-seed-jump-audit.ts"'
if "test-r28-core-a-safety-context" not in pt:
    repl = (
        'npx tsx --tsconfig tsconfig.node.json scripts/test-r27-seed-jump-audit.ts && '
        'npx tsx --tsconfig tsconfig.node.json scripts/test-r28-core-a-safety-context.ts && '
        'npx tsx --tsconfig tsconfig.node.json scripts/test-r28-filter-empty-decline.ts"'
    )
    assert needle in pt, "package.json r27 needle missing"
    pt = pt.replace(needle, repl, 1)
    pkg.write_text(pt, encoding="utf-8")
    print("package.json wired")
else:
    print("package.json already")
