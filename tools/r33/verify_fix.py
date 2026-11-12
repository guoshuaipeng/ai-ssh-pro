from pathlib import Path
t = Path("scripts/test-r33-miss-en-chip-shots.ts").read_text(encoding="utf-8")
print(t)
print("====MATRIX expect====")
m = Path("scripts/ai-shot-matrix-r33.mjs").read_text(encoding="utf-8")
print(m[m.find("expectMiss"):m.find("expectAsk")+50])
print("====import====")
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
for line in p.splitlines():
    if "toast" in line.lower() and "import" in line:
        print(line)
