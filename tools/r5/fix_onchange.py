from pathlib import Path
p = Path("src/renderer/src/tauri-bridge.ts")
t = p.read_text(encoding="utf-8")
old = "onChanged: (cb: AnyFn) => listen('docker:changed', cb),"
new = """onChanged: (cb: AnyFn) =>
        unsubListen(
          listen('docker:changed', (e) => {
            cb(e.payload)
          })
        ),"""
assert old in t
p.write_text(t.replace(old, new), encoding="utf-8")
print("ok")
