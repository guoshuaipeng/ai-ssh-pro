from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
for s in ["protection === 'production'", "protectionForUi === 'production'", "elevated && protection ===", "elevated && protectionForUi ==="]:
    print(repr(s), p.count(s))
# show around panelProdAuto
i = p.find("panelProdAuto = prodAutoHint")
print(p[i-200:i+450])
