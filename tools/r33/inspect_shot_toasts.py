from pathlib import Path
# find shot-toasts anywhere
hits=[]
for path in Path(".").rglob("*"):
    if path.is_file() and path.suffix in {".css",".tsx",".ts",".mjs",".js",".scss"} and "node_modules" not in str(path) and "dist" not in str(path):
        try:
            t=path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "shot-toasts" in t:
            hits.append(str(path))
print("files", hits)
for h in hits:
    t=Path(h).read_text(encoding="utf-8", errors="ignore")
    i=t.find("shot-toasts")
    print("====", h, "====")
    print(t[max(0,i-250):i+400])

# harness toasts flag
har=Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
i=har.find("shot-toasts")
print("====har====")
print(har[i-300:i+400])
# also look for toasts: true in shots
import re
print("toasts true count", len(re.findall(r"toasts:\s*true", har)))
print("example", re.search(r"toasts:\s*true.{0,80}", har))
