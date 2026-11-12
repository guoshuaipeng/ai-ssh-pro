from pathlib import Path
pt = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
idx = pt.find("if (detail?.op === 'aiError')")
print(pt[idx:idx+900])
