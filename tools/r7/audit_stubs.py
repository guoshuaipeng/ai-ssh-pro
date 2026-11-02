from pathlib import Path
bridge = Path("src/renderer/src/tauri-bridge.ts").read_text(encoding="utf-8")
stubs = []
for i, l in enumerate(bridge.splitlines(), 1):
    s = l.strip()
    if (
        "notImpl(" in s
        or "async () => []" in s
        or "async () => null" in s
        or "async () => false" in s
        or "=> () => {}" in s
        or "async () => ({" in s
        or "async () => ''" in s
    ):
        stubs.append(f"{i}: {s}")
print("count", len(stubs))
for s in stubs:
    print(s)
