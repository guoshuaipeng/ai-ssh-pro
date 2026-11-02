from pathlib import Path
p = Path("src-tauri/src/server_tools.rs")
t = p.read_text(encoding="utf-8")
t = t.replace("let mut pid = None;", "let mut pid: Option<u64> = None;")
lines = t.splitlines()
out = []
i = 0
while i < len(lines):
    l = lines[i]
    if "let secs" in l and "@@" in l and "replace" in l:
        out.append('    let cleaned = stdout.replace(\'\\r\', "");')
        out.append('    let secs: Vec<&str> = cleaned.split("@@").map(|s| s.trim()).collect();')
        i += 1
        continue
    out.append(l)
    i += 1
p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("fixed")
