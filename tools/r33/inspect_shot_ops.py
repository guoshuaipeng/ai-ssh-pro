from pathlib import Path
# How AIPanel handles screenshot ops - look for aiProdBanner / screenshotProtectionOverride pattern
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
for needle in ["screenshotProtectionOverride", "aiProdBanner", "aiReadonlyBanner", "aiEmptyConfig", "aiModelMissing", "aiError", "screenshotLocale", "setLocale", "aiMissToast", "aiPolicyAsk"]:
    i = p.find(needle)
    print(f"{needle}: {i}")

# extract screenshot effect block
i = p.find("detail?.op === 'aiEmptyConfig'")
print("====aiEmptyConfig block====")
print(p[i-200:i+800])

# App setLocale screenshot
app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
i = app.find("setLocale")
print("====App setLocale contexts====")
# find all
start=0
while True:
    i=app.find("setLocale", start)
    if i<0: break
    print(app[max(0,i-120):i+200].replace("\n"," | "))
    print("---")
    start=i+1
