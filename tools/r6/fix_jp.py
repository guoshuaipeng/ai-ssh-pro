from pathlib import Path
p = Path("src-tauri/src/jump_probe.rs")
t = p.read_text(encoding="utf-8")
t = t.replace('"127.0.0.1".into()', '"127.0.0.1".to_string()')
p.write_text(t, encoding="utf-8")
print("fixed")
