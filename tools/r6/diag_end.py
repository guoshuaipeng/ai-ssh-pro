from pathlib import Path
t = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
j = t.find("name: 'ai-exec-audit'")
k = t.find("const ONLY", j)
chunk = t[j-5:k]
print(chunk[-800:])
print("---")
print("bracket balance", chunk.count("["), chunk.count("]"))
print("ends with", repr(chunk[-40:]))
