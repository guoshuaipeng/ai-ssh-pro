from pathlib import Path
t = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
i = t.find("name: 'r6-audit'")
print("--- around r6-audit ---")
print(t[i-100:i+500])
print("--- check for backticks/dollar in new block ---")
j = t.find("name: 'ai-exec-audit'")
k = t.find("]\nconst ONLY", j)
chunk = t[j:k]
for ch in ["`", "${"]:
    if ch in chunk:
        print("FOUND", repr(ch), "at", chunk.find(ch))
print("backticks", chunk.count("`"))
