from pathlib import Path
import re
t = Path("src/renderer/src/lib/i18n.tsx").read_text(encoding="utf-8")
keys = ["s4.banner","s4.bannerShort","l4.bannerProd","l4.bannerPaused","prodAuto.panelHint","prodAuto.chip","policy.capReadonly","ai.auditReadonly"]
for k in keys:
    pat = re.compile(r"'%s':\s*(?:\"([^\"]*)\"|'([^']*)')" % re.escape(k))
    hits = pat.findall(t)
    print(k, "count=", len(hits))
    for a,b in hits[:2]:
        print(" ", (a or b)[:200])
