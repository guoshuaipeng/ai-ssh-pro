from pathlib import Path
p = Path("src-tauri/src/session_import.rs")
t = p.read_text(encoding="utf-8")
t = t.replace(
    'if text.contains("ProxyPassword") || text.to_ascii_lowercase().contains("password\\\\") {',
    'if text.contains("ProxyPassword") || text.to_ascii_lowercase().contains("\\"password\\"") {',
)
# simpler:
t2 = Path("src-tauri/src/session_import.rs").read_text(encoding="utf-8")
for i,line in enumerate(t2.splitlines(),1):
    if "ProxyPassword" in line:
        print(i, repr(line))
