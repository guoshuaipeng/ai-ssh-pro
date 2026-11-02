from pathlib import Path
p = Path("src/renderer/src/tauri-bridge.ts")
t = p.read_text(encoding="utf-8")
old = "invoke('core_memory_append_observations', { sessionKey, texts })\n      appendEpisode"
new = "invoke('core_memory_append_observations', { sessionKey, texts }),\n      appendEpisode"
if old not in t:
    raise SystemExit("pattern not found")
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("ok")
