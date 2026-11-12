from pathlib import Path
sk = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
# show imports and how r28 is merged
for i,line in enumerate(sk.splitlines()):
    if "r28" in line.lower() or "r14Ai" in line or "extraShots" in line or "aiShots" in line or "only" in line and "matrix" in line.lower():
        if i < 120 or "r28" in line.lower() or "AiShots" in line:
            print(f"{i+1}:{line}")
