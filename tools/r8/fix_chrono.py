from pathlib import Path
p = Path("src-tauri/src/server_tools.rs")
t = p.read_text(encoding="utf-8")
old = '"at": chrono::Utc::now().timestamp_millis(),'
new = '"at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),'
if old not in t:
    print("chrono line missing or already fixed")
else:
    p.write_text(t.replace(old, new, 1), encoding="utf-8")
    print("chrono fixed")
