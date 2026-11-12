from pathlib import Path
t = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
j = t.find("aud-r6-3")
print(repr(t[j:j+200]))
# Simulate extracting the template: find writeFileSync template body
# The template starts after writeFileSync( join..., `\n
start = t.find("writeFileSync(\n  join(wrapperDir, 'main.mjs'),\n  `\n")
if start < 0:
    start = t.find("join(wrapperDir, 'main.mjs')")
    print("alt", start)
    print(repr(t[start:start+80]))
else:
    print("template start", start)
# Find matching close: `\n)
# Count if ${ appears in chrome section that would break
i = t.find("const chrome = [")
k = t.find("const ONLY = ${JSON.stringify(only)}")
body = t[i:k]
print("chrome body ${ count", body.count("${"))
print("chrome body ` count", body.count("`"))
# Try to Function-parse chrome by extracting with ONLY mocked
# Write a temp file of just the array
arr_start = t.find("const chrome = [")
arr_end = t.find("]\nconst ONLY", arr_start) + 1
snippet = "const W=[1,2], N=[3,4];\n" + t[arr_start:arr_end] + "\nconsole.log(chrome.length, chrome.map(s=>s.name).join(','))\n"
Path("tools/r6/chrome_snip.mjs").write_text(snippet, encoding="utf-8")
print("wrote snip", len(snippet))
