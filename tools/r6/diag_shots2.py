from pathlib import Path
t = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
j = t.find("name: 'ai-exec-audit'")
k = t.find("]\nconst ONLY", j)
chunk = t[j:k]
# find $ occurrences with context
for i,c in enumerate(chunk):
    if c == "$":
        print(i, repr(chunk[max(0,i-30):i+40]))
print("total $", chunk.count("$"))
# also check if the writeFileSync template is broken by looking for syntax via extracting
# Try to find writeFileSync start
ws = t.find("writeFileSync(\n  join(wrapperDir, 'main.mjs')")
print("write at", ws)
