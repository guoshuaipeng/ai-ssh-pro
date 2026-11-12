# -*- coding: utf-8 -*-
from pathlib import Path
p = Path("package.json")
t = p.read_text(encoding="utf-8")
old = 'scripts/test-r25-memory-expand.ts"'
add = (
    "scripts/test-r25-memory-expand.ts"
    " && npx tsx --tsconfig tsconfig.node.json scripts/test-r26-ai-shot-harness.ts"
    " && npx tsx --tsconfig tsconfig.web.json scripts/test-r26-hierarchy-audit-empty.ts"
    " && npx tsx --tsconfig tsconfig.web.json scripts/test-r27-visual-audit-touch.ts"
    '"'
)
if "test-r27-visual-audit-touch" in t:
    print("already wired")
elif old not in t:
    raise SystemExit("anchor missing")
else:
    t = t.replace(old, add, 1)
    p.write_text(t, encoding="utf-8")
    print("wired r26+r27")
css = Path("src/renderer/src/styles.css").read_text(encoding="utf-8")
print("R27 css", "R27 Round27: memory expand touch hit" in css)
