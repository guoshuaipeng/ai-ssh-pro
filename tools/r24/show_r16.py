from pathlib import Path
p = Path("scripts/test-r16-plan-progress.ts")
t = p.read_text(encoding="utf-8")
print("--- lines with runProgress ---")
for i, ln in enumerate(t.splitlines(), 1):
    if "runProgress" in ln or "ai-run-steps" in ln or "busy" in ln:
        print(f"{i}:{ln}")
