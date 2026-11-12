from pathlib import Path
sk = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
lines = sk.splitlines()
for i in range(1, 25):
    print(f"{i}:{lines[i-1]}")
print("====")
for i in range(380, 420):
    if i <= len(lines):
        print(f"{i}:{lines[i-1]}")
# also find how --set chrome gathers
for i,l in enumerate(lines):
    if "r28AiShots" in l or "CHROME" in l or "chromeShots" in l or "buildChrome" in l:
        print(f"HIT {i+1}:{l}")
