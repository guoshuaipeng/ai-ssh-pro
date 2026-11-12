from pathlib import Path
app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
i = app.find("const onShot = ")
print(app[i:i+400])
# find addEventListener for onShot
j = app.find("onShot", i+20)
print("====register====")
print(app[j:j+250])
# also AIPanel
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
j = p.find("onShot")
if j<0: j = p.find("screenshotHooksEnabled")
print("====panel====")
print(p[j:j+400])
