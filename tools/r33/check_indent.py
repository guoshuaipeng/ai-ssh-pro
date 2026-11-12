from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
i = p.find("Round 33: calm miss toast")
print(p[i-200:i+900])
print("====INDENT CHECK====")
# compare indent of aiMissToast vs aiReadonlyBanner vs aiProdBanner handlers
for label in ["aiMissToast", "aiReadonlyBanner", "aiProdBanner", "aiEmptyConfig"]:
    idx = p.find(f"if (detail?.op === '{label}')")
    if idx<0:
        print(label, "NOT FOUND as if")
        continue
    line_start = p.rfind("\n", 0, idx)+1
    line = p[line_start:p.find("\n", idx)]
    print(repr(line[:80]))
