from pathlib import Path
raw = Path("src-tauri/gen/schemas/desktop-schema.json").read_text(encoding="utf-8")
# find window:default permission set description
i = raw.find("Default permissions for the plugin")
# better: find const core:window:default with nearby list
idx = 0
while True:
    j = raw.find('"const": "core:window:default"', idx)
    if j < 0: break
    print(raw[max(0,j-800):j+200])
    print('----')
    idx = j + 1
