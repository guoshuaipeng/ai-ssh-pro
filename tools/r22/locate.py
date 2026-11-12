from pathlib import Path
p = Path(r"src/renderer/src/components/AIPanel.tsx")
t = p.read_text(encoding="utf-8")
for needle in ["aiConfirm", "ai-pending-confirm", "aiFailureEvidence", "au2.openAiMiss"]:
    print("===", needle, "===")
    idx = 0
    n = 0
    while n < 8:
        i = t.find(needle, idx)
        if i < 0:
            break
        line = t.count("\n", 0, i) + 1
        snippet = t[max(0, i - 30) : i + 90].replace("\n", " / ")
        print(line, snippet)
        idx = i + len(needle)
        n += 1
