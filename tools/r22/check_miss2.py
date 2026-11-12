from pathlib import Path
panel = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
idx = panel.find("const miss = buildAuditOpenAiMissToast")
print(panel[idx:idx+600] if idx>=0 else "NOT FOUND")
