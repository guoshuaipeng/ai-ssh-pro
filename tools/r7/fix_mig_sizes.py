from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
old = """| `ai-ssh-pro.exe`（release） | **7.62 MB** (7987200) | Round-6 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.18 MB** (3337872) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.12 MB** (4321280) | |"""
new = """| `ai-ssh-pro.exe`（release） | **7.71 MB** (8089088) | Round-7 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.21 MB** (3368371) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.16 MB** (4362240) | |"""
if old not in t:
    print("table missing; current snippet:")
    i = t.find("ai-ssh-pro.exe")
    print(t[i:i+300])
else:
    t = t.replace(old, new)
    print("table updated")
needle = "## 构建\n\n```bash\nnpm run build:tauri\n```"
if "refresh-desktop-shortcut" not in t and needle in t:
    t = t.replace(
        needle,
        needle
        + "\n\n构建结束后刷新桌面快捷方式 `AI-SSH-Pro (Tauri latest).lnk` → `src-tauri/target/release/ai-ssh-pro.exe`。也可 `npm run shortcut:tauri`。",
    )
    print("shortcut note added")
p.write_text(t, encoding="utf-8")
