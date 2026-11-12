from pathlib import Path
p = Path("package.json")
raw = p.read_text(encoding="utf-8")
needle = 'scripts/test-r24-retry-plan-align.ts"'
insert = 'scripts/test-r24-retry-plan-align.ts && npx tsx --tsconfig tsconfig.web.json scripts/test-r24-next-confirm-short.ts"'
if "test-r24-next-confirm-short" in raw:
    print("already")
elif needle not in raw:
    raise SystemExit("needle missing")
else:
    p.write_text(raw.replace(needle, insert, 1), encoding="utf-8")
    print("wired short test")
