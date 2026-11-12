from pathlib import Path
panel = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
print("au2.openAiMiss" in panel)
print("messageKey" in panel)
idx = panel.find("buildAuditOpenAiMissToast")
print(panel[idx:idx+500])
