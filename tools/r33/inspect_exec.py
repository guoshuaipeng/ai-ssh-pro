from pathlib import Path
import re
har = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
# find execution of s.steps / shot.steps / steps in loop
for pat in [r"\.steps", r"for \(const step", r"await fire\(win, s", r"executeJavaScript", r"expect\)", r"eval:"]:
    ms = list(re.finditer(pat, har))
    print(pat, len(ms))
    for m in ms[:5]:
        print(" @" , m.start(), har[m.start()-80:m.start()+200].replace("\n"," | ")[:220])
        print("---")
