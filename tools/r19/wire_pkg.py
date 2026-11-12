from pathlib import Path
p = Path("package.json")
t = p.read_text(encoding="utf-8")
needle = "scripts/test-r18-ai-shot-harness.ts"
if "test-r19-policy-menu-touch" in t:
    print("already wired")
else:
    if needle not in t:
        raise SystemExit("needle missing")
    t = t.replace(
        needle,
        needle
        + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r19-policy-menu-touch.ts"
        + " && npx tsx --tsconfig tsconfig.web.json scripts/test-r19-confirm-dock-narrow.ts",
        1,
    )
    p.write_text(t, encoding="utf-8")
    print("wired")
