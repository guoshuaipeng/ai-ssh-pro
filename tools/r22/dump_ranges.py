from pathlib import Path
p = Path(r"src/renderer/src/components/AIPanel.tsx")
lines = p.read_text(encoding="utf-8").splitlines()
for a,b in [(990,1060),(1840,1920),(3355,3435)]:
    print(f"===== {a}-{b} =====")
    for i in range(a-1, min(b, len(lines))):
        print(f"{i+1}|{lines[i]}")
