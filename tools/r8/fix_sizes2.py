from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
t = t.replace(
    "| `ai-ssh-pro.exe`（release） | **(pending Round-8 build)** | Round-8 |",
    "| `ai-ssh-pro.exe`（release） | **7.95 MB** (8334336) | Round-8 |",
)
t = t.replace(
    "| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.21 MB** (3368371) |",
    "| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.29 MB** (3449270) |",
)
t = t.replace(
    "| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.16 MB** (4362240) |",
    "| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.27 MB** (4476928) |",
)
p.write_text(t, encoding="utf-8")
print("done")
for line in p.read_text(encoding="utf-8").splitlines():
    if "ai-ssh-pro.exe`（release）" in line or "NSIS `" in line or "MSI `" in line:
        if line.strip().startswith("|"):
            print(line)
