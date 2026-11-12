from pathlib import Path

# i18n miss strings
i18n = Path("src/renderer/src/lib/i18n.tsx").read_text(encoding="utf-8")
for k in ["au2.openAiMiss", "au2.openAiMissAction", "policy.chip.ask", "policy.chip.suggest", "policy.chip.auto"]:
    for loc, start in [("zh", i18n.find("'zh'") if False else 0), ("scan", 0)]:
        pass
# find both occurrences
idx = 0
while True:
    i = i18n.find(f"'{k}'", idx) if False else -1
    break
for k in ["au2.openAiMiss", "au2.openAiMissAction", "policy.chip.ask", "policy.chip.suggest", "policy.chip.auto"]:
    idxs = []
    start = 0
    while True:
        i = i18n.find(f"'{k}':", start)
        if i < 0: break
        idxs.append(i)
        start = i + 1
    for i in idxs:
        print(i18n[i:i+120].replace("\n"," "))

print("====TOAST====")
print(Path("src/renderer/src/lib/toast.tsx").read_text(encoding="utf-8")[:2500])

print("====SCREENSHOT HOOKS ops====")
hooks = Path("src/renderer/src/lib/screenshot-hooks.ts").read_text(encoding="utf-8")
print(hooks[:3000])
