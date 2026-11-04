from pathlib import Path
t = Path("src-tauri/src/core_memory.rs").read_text(encoding="utf-8")
for line in t.splitlines():
    if "Ordering::" in line:
        i = line.index("Ordering::")
        frag = line[i:i+20]
        print(frag, [hex(ord(c)) for c in frag])
# Fix FinalShell broken string with nested quotes
si = Path("src-tauri/src/session_import.rs").read_text(encoding="utf-8")
bad = '''|| text.to_ascii_lowercase().contains(""encrypt":true")'''
# what is actually there
idx = si.find("encrypt")
print("encrypt contexts:")
for i,line in enumerate(si.splitlines(),1):
    if "encrypt" in line.lower() and "contains" in line:
        print(i, repr(line))
