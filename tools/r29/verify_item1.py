from pathlib import Path
import re
t = Path("src/renderer/src/lib/i18n.tsx").read_text(encoding="utf-8")
for k in ["roHost.chip", "roHost.panelHint", "roHost.tip"]:
    print(k, t.count(f"'{k}':"))
for i, m in enumerate(re.finditer(r"'roHost\.chip':", t)):
    print("---", i, "---")
    print(t[m.start(): m.start()+260])
# also check CSS and panel
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
print("panelReadonly", "panelReadonly = readonlyHostHint" in p)
print("testid", 'data-testid="ai-readonly-banner"' in p)
print("shot", "aiReadonlyBanner" in p)
print("hooks", "aiReadonlyBanner" in Path("src/renderer/src/lib/screenshot-hooks.ts").read_text(encoding="utf-8"))
