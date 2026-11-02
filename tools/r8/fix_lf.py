from pathlib import Path

def to_lf(path: Path):
    raw = path.read_bytes()
    # strip CR
    text = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    path.write_bytes(text.encode("utf-8"))
    print(path, "LF ok", text.count("\n"), "lines")

to_lf(Path("src-tauri/src/core_memory.rs"))
to_lf(Path("src-tauri/src/session_import.rs"))

si = Path("src-tauri/src/session_import.rs")
t = si.read_text(encoding="utf-8")
old = 'if text.contains("ProxyPassword") || text.to_ascii_lowercase().contains("password\\\\") {'
# find actual
for i,line in enumerate(t.splitlines(),1):
    if "ProxyPassword" in line:
        print("putty line", i, repr(line))
# replace any password\\ contains with simpler
import re
t2 = re.sub(
    r'if text\.contains\("ProxyPassword"\) \|\| text\.to_ascii_lowercase\(\)\.contains\("[^"]*"\) \{',
    'if text.contains("ProxyPassword") || text.to_ascii_lowercase().contains("password") {\n                // note: does not decrypt; user must re-enter secrets',
    t,
    count=1,
)
si.write_text(t2.replace("\r\n","\n"), encoding="utf-8", newline="\n")
print("putty fixed")
