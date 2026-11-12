from pathlib import Path
lines = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8").splitlines()
# pendingPreview derivation
for i,l in enumerate(lines):
    if "pendingPreview" in l and ("const " in l or "pendingPreview =" in l or "pendingPreviewRaw" in l):
        if i < 1900:
            print(f"{i+1}|{l}")
# check ai.activePlanStep
i18n = Path("src/renderer/src/lib/i18n.tsx").read_text(encoding="utf-8")
print("activePlanStep zh", "ai.activePlanStep" in i18n)
idx = i18n.find("'ai.activePlanStep'")
print(i18n[idx:idx+120] if idx>=0 else "missing")
