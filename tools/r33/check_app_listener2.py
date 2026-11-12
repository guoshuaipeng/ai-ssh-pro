from pathlib import Path
app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
for n in ["screenshot", "aiss-shot", "SCREENSHOT", "onShot", "__aissShot"]:
    print(n, app.count(n))
# find where detail.op === 'theme' lives - what function
i = app.find("detail.op === 'theme'")
# walk back to function
chunk = app[max(0,i-2500):i]
# find function/effect
import re
ms = list(re.finditer(r"useEffect\(|function |const on|addEventListener", chunk))
print("nearby constructs:")
for m in ms[-8:]:
    print(m.group(), "@", m.start(), chunk[m.start():m.start()+100].replace("\n"," | ")[:100])
