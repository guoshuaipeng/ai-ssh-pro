from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
# how screenshotProtectionOverride is typed/set
for needle in ["screenshotProtectionOverride", "setScreenshotProtectionOverride"]:
    start=0
    c=0
    while c<8:
        i=p.find(needle, start)
        if i<0: break
        print(p[i:i+120].replace("\n"," | "))
        print("---")
        start=i+len(needle); c+=1
