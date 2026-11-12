from pathlib import Path
import json
p = Path("package.json")
raw = p.read_text(encoding="utf-8")
needle = 'scripts/test-r23-retry-scroll-confirm.ts"'
insert = 'scripts/test-r23-retry-scroll-confirm.ts && npx tsx --tsconfig tsconfig.node.json scripts/test-r24-retry-plan-align.ts"'
if "test-r24-retry-plan-align" in raw:
    print("already wired")
elif needle not in raw:
    raise SystemExit("needle missing in test:parts")
else:
    p.write_text(raw.replace(needle, insert, 1), encoding="utf-8")
    print("wired test-r24 into test:parts")
