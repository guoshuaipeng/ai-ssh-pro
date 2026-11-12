# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\package.json")
t = p.read_text(encoding="utf-8")
needle = "npx tsx --tsconfig tsconfig.web.json scripts/test-r16-batch-fill-sticky.ts"
ins = needle + " && npx tsx --tsconfig tsconfig.node.json scripts/test-r18-plan-step-align.ts"
if "test-r18-plan-step-align" in t:
    print("already in package.json")
elif needle not in t:
    raise SystemExit("needle missing in package.json")
else:
    p.write_text(t.replace(needle, ins, 1), encoding="utf-8")
    print("package.json updated")
