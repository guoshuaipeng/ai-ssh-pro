from pathlib import Path
p = Path("scripts/test-r33-miss-en-chip-shots.ts")
t = p.read_text(encoding="utf-8")
t = t.replace("assert.ok(miss?.expect?.includes('新开对话'))\nassert.ok(panel.includes('clearToasts'))\n\n", "assert.ok(miss?.expect?.includes('新开对话'))\n\n")
if "assert.ok(panel.includes('clearToasts'))" not in t:
    t = t.replace(
        "assert.ok(panel.includes('Round 33: calm miss toast'))\n",
        "assert.ok(panel.includes('Round 33: calm miss toast'))\nassert.ok(panel.includes('clearToasts'))\n",
    )
p.write_text(t, encoding="utf-8", newline="\n")
print("fixed")
