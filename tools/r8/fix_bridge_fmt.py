from pathlib import Path
p = Path("src/renderer/src/tauri-bridge.ts")
t = p.read_text(encoding="utf-8")
old = "invoke('core_memory_recall', { sessionKey, query, topK: topK ?? null }),    },"
new = "invoke('core_memory_recall', { sessionKey, query, topK: topK ?? null }),\n    },"
if old not in t:
    raise SystemExit("format target missing")
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("bridge format ok")
