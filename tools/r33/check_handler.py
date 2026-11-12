# -*- coding: utf-8 -*-
from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
print("aiMissToast count", p.count("aiMissToast"))
# show gate and nearby handlers
i = p.find("aiMissToast")
print("first:", p[i-120:i+200])
# is there a handler block?
print("has showToast miss in shot?", "Round 33: calm miss toast" in p)
i = p.find("if (detail?.op === 'aiReadonlyBanner')")
print("readonly handler at", i)
