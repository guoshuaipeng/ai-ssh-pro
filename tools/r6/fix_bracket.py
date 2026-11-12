from pathlib import Path
p = Path("scripts/screenshot-key-screens.mjs")
t = p.read_text(encoding="utf-8")
# fix double ]]
t2 = t.replace("wait: 900 }\n]]\nconst ONLY", "wait: 900 }\n]\nconst ONLY", 1)
if t2 == t:
    # try other patterns
    i = t.find("r6-h05-stop")
    j = t.find("const ONLY", i)
    print(repr(t[j-20:j+20]))
    raise SystemExit('pattern not found')
p.write_text(t2, encoding="utf-8", newline="\n")
print("fixed double bracket")
