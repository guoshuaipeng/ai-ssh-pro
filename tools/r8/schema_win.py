from pathlib import Path
raw = Path("src-tauri/gen/schemas/desktop-schema.json").read_text(encoding="utf-8")
for needle in ['"core:default"', "start-dragging", "core:window:default", "set-decorations"]:
    i = raw.find(needle)
    print("===", needle, i)
    if i >= 0:
        print(raw[i : i + 500])
