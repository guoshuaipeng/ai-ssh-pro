from pathlib import Path
p = Path("src-tauri/src/lib.rs")
t = p.read_text(encoding="utf-8")
needle = '    json!({ "ok": ok, "fail": fail })\n}'
# only in apply_import region
start = t.find("fn known_hosts_apply_import")
region = t[start:start+900]
if "invalidate_cache" not in region:
    old = '    json!({ "ok": ok, "fail": fail })\n}'
    # find first occurrence after start
    idx = t.find(old, start)
    assert idx > 0
    t = t[:idx] + "    crate::known_hosts_lookup::invalidate_cache();\n" + t[idx:]
    p.write_text(t, encoding="utf-8")
    print("invalidate on import added")
else:
    print("already")
