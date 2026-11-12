from pathlib import Path
# Is showToast or setLocale exposed for screenshot eval?
for path in ["src/renderer/src/App.tsx", "src/renderer/src/lib/toast.tsx", "src/renderer/src/main.tsx", "src/renderer/src/lib/i18n.tsx"]:
    t = Path(path).read_text(encoding="utf-8")
    for n in ["window.showToast", "__aissShowToast", "window.aiss", "__setLocale", "screenshotLocale"]:
        if n in t:
            print(path, n)

# how aiComposerPop is handled
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
i = p.find("aiComposerPop")
print("====aiComposerPop====")
print(p[i:i+600] if i>=0 else "none in panel")

app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
i = app.find("aiComposerPop")
print("====App aiComposerPop====")
print(app[i-100:i+400] if i>=0 else "none")

# look at shot-toasts CSS - toasts hidden by default in screenshots?
styles = Path("src/renderer/src/styles.css").read_text(encoding="utf-8")
i = styles.find("shot-toasts")
print("====shot-toasts====")
print(styles[i-200:i+400] if i>=0 else "none")
# also features
feat = Path("src/renderer/src/features.css").read_text(encoding="utf-8")
i = feat.find("shot-toasts")
print("feat shot-toasts", feat[i-100:i+300] if i>=0 else "none")
